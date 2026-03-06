// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title AgentRegistry
 * @notice On-chain registry for Kortana marketing agents on Creditcoin EVM Testnet (chain 102031)
 * @dev Manages agent registration, job lifecycle, and reputation scoring
 *
 * Security model:
 *   - Checks-Effects-Interactions (CEI) pattern throughout
 *   - Reentrancy guard on all state-modifying + ETH-transferring functions
 *   - Only the CLIENT can mark a job complete (releases escrow to agent)
 *   - Only the AGENT OWNER can mark a job failed (refunds client)
 *   - Exact payment enforced — no silent overpayment
 */
contract AgentRegistry {

    // ─── Reentrancy Guard ────────────────────────────────────────────────────

    uint256 private _status;
    uint256 private constant _NOT_ENTERED = 1;
    uint256 private constant _ENTERED = 2;

    modifier nonReentrant() {
        require(_status != _ENTERED, "Reentrant call");
        _status = _ENTERED;
        _;
        _status = _NOT_ENTERED;
    }

    // ─── Structs ────────────────────────────────────────────────────────────

    struct Agent {
        string  name;
        string  endpoint;
        uint256 priceCTC;       // Exact price in wei (CTC)
        string  category;
        string  description;
        uint256 reputation;     // 0–10,000 basis points (10,000 = 100%)
        uint256 jobsCompleted;
        uint256 jobsFailed;
        uint256 totalEarned;    // Total CTC earned in wei
        bool    isActive;
        address owner;
    }

    enum JobStatus { Pending, Complete, Failed }

    struct Job {
        bytes32   agentId;
        address   client;
        uint256   escrow;        // CTC in wei (exactly priceCTC at creation)
        JobStatus status;
        uint256   createdAt;
        uint256   completedAt;
        bytes32   parentJobId;   // For multi-agent chains (0x0 if none)
    }

    // ─── State ───────────────────────────────────────────────────────────────

    mapping(bytes32 => Agent) public agents;
    mapping(bytes32 => Job)   public jobs;
    bytes32[] public agentIds;
    bytes32[] public jobIds;

    uint256 public constant REP_SUCCESS_BONUS   = 50;    // +50 bp per success
    uint256 public constant REP_FAILURE_PENALTY = 100;   // -100 bp per failure
    uint256 public constant MAX_REPUTATION      = 10_000;

    // ─── Events ──────────────────────────────────────────────────────────────

    event AgentRegistered(bytes32 indexed agentId, string name, address indexed owner);
    event AgentUpdated(bytes32 indexed agentId);
    event JobCreated(bytes32 indexed jobId, bytes32 indexed agentId, address indexed client, uint256 escrow);
    event JobCompleted(bytes32 indexed jobId);
    event JobFailed(bytes32 indexed jobId);

    // ─── Modifiers ───────────────────────────────────────────────────────────

    modifier onlyAgentOwner(bytes32 agentId) {
        require(agents[agentId].owner == msg.sender, "Not agent owner");
        _;
    }

    constructor() {
        _status = _NOT_ENTERED;
    }

    // ─── Internal Transfer Helper ─────────────────────────────────────────────

    /**
     * @dev Safe ETH transfer using low-level call to avoid 2300-gas limit of .transfer().
     */
    function _safeTransfer(address to, uint256 amount) internal {
        (bool ok, ) = payable(to).call{value: amount}("");
        require(ok, "CTC transfer failed");
    }

    // ─── Agent Registration ──────────────────────────────────────────────────

    /**
     * @notice Register a new marketing agent
     * @param name Human-readable name (e.g., "SEO Blog Writer")
     * @param endpoint API endpoint URL
     * @param priceCTC Exact price per job in wei CTC
     * @param category Agent category (content, social, strategy, etc.)
     * @param description Short description of the agent's capabilities
     * @return agentId Unique identifier for the registered agent
     */
    function registerAgent(
        string calldata name,
        string calldata endpoint,
        uint256 priceCTC,
        string calldata category,
        string calldata description
    ) external returns (bytes32 agentId) {
        require(bytes(name).length > 0, "Name required");
        require(priceCTC > 0, "Price must be > 0");

        agentId = keccak256(abi.encodePacked(name, msg.sender, block.timestamp));

        // Prevent silent overwrite of an existing agent
        require(agents[agentId].owner == address(0), "Agent ID collision, try again");

        agents[agentId] = Agent({
            name:          name,
            endpoint:      endpoint,
            priceCTC:      priceCTC,
            category:      category,
            description:   description,
            reputation:    5_000,   // Start at 50%
            jobsCompleted: 0,
            jobsFailed:    0,
            totalEarned:   0,
            isActive:      true,
            owner:         msg.sender
        });

        agentIds.push(agentId);
        emit AgentRegistered(agentId, name, msg.sender);
    }

    /**
     * @notice Update an existing agent's endpoint and/or price
     */
    function updateAgent(
        bytes32 agentId,
        string calldata endpoint,
        uint256 priceCTC
    ) external onlyAgentOwner(agentId) {
        require(priceCTC > 0, "Price must be > 0");
        agents[agentId].endpoint = endpoint;
        agents[agentId].priceCTC = priceCTC;
        emit AgentUpdated(agentId);
    }

    /**
     * @notice Deactivate an agent (prevents new job creation)
     */
    function deactivateAgent(bytes32 agentId) external onlyAgentOwner(agentId) {
        agents[agentId].isActive = false;
        emit AgentUpdated(agentId);
    }

    // ─── Job Lifecycle ───────────────────────────────────────────────────────

    /**
     * @notice Create a new job and escrow exactly priceCTC.
     *         msg.value must equal agent.priceCTC exactly — no over/underpayment.
     * @param agentId     The agent to hire
     * @param parentJobId Optional parent job ID for multi-agent chains (pass bytes32(0) if none)
     * @return jobId      Unique identifier for the created job
     */
    function createJob(bytes32 agentId, bytes32 parentJobId)
        external
        payable
        nonReentrant
        returns (bytes32 jobId)
    {
        Agent storage agent = agents[agentId];
        require(agent.isActive, "Agent not active");
        require(agent.owner != address(0), "Agent does not exist");
        require(msg.value == agent.priceCTC, "Send exactly priceCTC");

        jobId = keccak256(abi.encodePacked(agentId, msg.sender, block.timestamp, jobIds.length));
        // Ensure no collision (practically impossible but explicit is safer)
        require(jobs[jobId].client == address(0), "Job ID collision, try again");

        jobs[jobId] = Job({
            agentId:     agentId,
            client:      msg.sender,
            escrow:      msg.value,
            status:      JobStatus.Pending,
            createdAt:   block.timestamp,
            completedAt: 0,
            parentJobId: parentJobId
        });

        jobIds.push(jobId);
        emit JobCreated(jobId, agentId, msg.sender, msg.value);
    }

    /**
     * @notice Client marks a job as complete, releasing escrow to the agent owner.
     *         Only the CLIENT who created the job may call this.
     * @param jobId The job to complete
     */
    function completeJob(bytes32 jobId) external nonReentrant {
        Job storage job = jobs[jobId];
        require(job.status == JobStatus.Pending, "Job not pending");
        require(job.client == msg.sender, "Only client can complete");

        // --- Effects (all state changes before external call) ---
        job.status = JobStatus.Complete;
        job.completedAt = block.timestamp;

        Agent storage agent = agents[job.agentId];
        agent.jobsCompleted++;
        agent.totalEarned += job.escrow;
        agent.reputation = agent.reputation + REP_SUCCESS_BONUS > MAX_REPUTATION
            ? MAX_REPUTATION
            : agent.reputation + REP_SUCCESS_BONUS;

        uint256 payout = job.escrow;
        address agentOwner = agent.owner;

        emit JobCompleted(jobId);

        // --- Interaction (external call last) ---
        _safeTransfer(agentOwner, payout);
    }

    /**
     * @notice Agent owner marks a job as failed, refunding escrow to the client.
     *         Only the AGENT OWNER may call this (they accept the failure + reputation hit).
     * @param jobId The job that failed
     */
    function failJob(bytes32 jobId) external nonReentrant {
        Job storage job = jobs[jobId];
        require(job.status == JobStatus.Pending, "Job not pending");
        require(agents[job.agentId].owner == msg.sender, "Only agent owner can fail");

        // --- Effects ---
        job.status = JobStatus.Failed;
        job.completedAt = block.timestamp;

        Agent storage agent = agents[job.agentId];
        agent.jobsFailed++;
        agent.reputation = agent.reputation >= REP_FAILURE_PENALTY
            ? agent.reputation - REP_FAILURE_PENALTY
            : 0;

        uint256 refund = job.escrow;
        address client = job.client;

        emit JobFailed(jobId);

        // --- Interaction ---
        _safeTransfer(client, refund);
    }

    // ─── Views ───────────────────────────────────────────────────────────────

    function getAgentIds() external view returns (bytes32[] memory) {
        return agentIds;
    }

    function getAgent(bytes32 agentId) external view returns (Agent memory) {
        return agents[agentId];
    }

    function getJob(bytes32 jobId) external view returns (Job memory) {
        return jobs[jobId];
    }

    /**
     * @notice Returns reputation as a 0–100 percentage
     */
    function getReputationPercent(bytes32 agentId) external view returns (uint256) {
        return agents[agentId].reputation / 100;
    }

    /**
     * @notice Count of active agents (O(n) — use off-chain indexing for large sets)
     */
    function getActiveAgentCount() external view returns (uint256 count) {
        for (uint256 i = 0; i < agentIds.length; i++) {
            if (agents[agentIds[i]].isActive) count++;
        }
    }
}
