// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/AgentRegistry.sol";

contract AgentRegistryTest is Test {
    AgentRegistry public registry;

    address public agentOwner = makeAddr("agentOwner");
    address public client     = makeAddr("client");
    address public stranger   = makeAddr("stranger");

    // Sample agent params
    string constant NAME        = "SEO Blog Writer";
    string constant ENDPOINT    = "https://kortana.onrender.com/api/seo-blog";
    uint256 constant PRICE      = 0.005 ether; // 0.005 CTC in wei
    string constant CATEGORY    = "content";
    string constant DESCRIPTION = "Writes SEO-optimized blog posts";

    bytes32 public agentId;
    bytes32 public jobId;

    function setUp() public {
        registry = new AgentRegistry();

        // Fund actors
        vm.deal(agentOwner, 10 ether);
        vm.deal(client,     10 ether);
        vm.deal(stranger,   10 ether);

        // Register a base agent for reuse across tests
        vm.prank(agentOwner);
        agentId = registry.registerAgent(NAME, ENDPOINT, PRICE, CATEGORY, DESCRIPTION);
    }

    // ─── registerAgent ────────────────────────────────────────────────────────

    function test_RegisterAgent_Success() public view {
        AgentRegistry.Agent memory a = registry.getAgent(agentId);
        assertEq(a.name,          NAME);
        assertEq(a.endpoint,      ENDPOINT);
        assertEq(a.priceCTC,      PRICE);
        assertEq(a.category,      CATEGORY);
        assertEq(a.description,   DESCRIPTION);
        assertEq(a.reputation,    5_000);
        assertEq(a.jobsCompleted, 0);
        assertEq(a.jobsFailed,    0);
        assertEq(a.totalEarned,   0);
        assertTrue(a.isActive);
        assertEq(a.owner, agentOwner);
    }

    function test_RegisterAgent_EmitsEvent() public {
        vm.prank(stranger);
        vm.expectEmit(false, true, false, false); // agentId is dynamic, check owner
        emit AgentRegistry.AgentRegistered(bytes32(0), "New Agent", stranger);
        registry.registerAgent("New Agent", ENDPOINT, PRICE, CATEGORY, DESCRIPTION);
    }

    function test_RegisterAgent_AppendedToList() public view {
        bytes32[] memory ids = registry.getAgentIds();
        assertEq(ids.length, 1);
        assertEq(ids[0], agentId);
    }

    function test_RegisterAgent_RejectsEmptyName() public {
        vm.prank(stranger);
        vm.expectRevert("Name required");
        registry.registerAgent("", ENDPOINT, PRICE, CATEGORY, DESCRIPTION);
    }

    function test_RegisterAgent_RejectsZeroPrice() public {
        vm.prank(stranger);
        vm.expectRevert("Price must be > 0");
        registry.registerAgent("Agent X", ENDPOINT, 0, CATEGORY, DESCRIPTION);
    }

    // ─── updateAgent ─────────────────────────────────────────────────────────

    function test_UpdateAgent_Success() public {
        string memory newEndpoint = "https://kortana.io/api/seo-blog-v2";
        uint256 newPrice = 0.007 ether;

        vm.prank(agentOwner);
        registry.updateAgent(agentId, newEndpoint, newPrice);

        AgentRegistry.Agent memory a = registry.getAgent(agentId);
        assertEq(a.endpoint, newEndpoint);
        assertEq(a.priceCTC, newPrice);
    }

    function test_UpdateAgent_RejectsNonOwner() public {
        vm.prank(stranger);
        vm.expectRevert("Not agent owner");
        registry.updateAgent(agentId, ENDPOINT, PRICE);
    }

    function test_UpdateAgent_RejectsZeroPrice() public {
        vm.prank(agentOwner);
        vm.expectRevert("Price must be > 0");
        registry.updateAgent(agentId, ENDPOINT, 0);
    }

    // ─── deactivateAgent ─────────────────────────────────────────────────────

    function test_DeactivateAgent_Success() public {
        vm.prank(agentOwner);
        registry.deactivateAgent(agentId);

        AgentRegistry.Agent memory a = registry.getAgent(agentId);
        assertFalse(a.isActive);
    }

    function test_DeactivateAgent_RejectsNonOwner() public {
        vm.prank(stranger);
        vm.expectRevert("Not agent owner");
        registry.deactivateAgent(agentId);
    }

    function test_DeactivateAgent_BlocksJobCreation() public {
        vm.prank(agentOwner);
        registry.deactivateAgent(agentId);

        vm.prank(client);
        vm.expectRevert("Agent not active");
        registry.createJob{value: PRICE}(agentId, bytes32(0));
    }

    // ─── createJob ───────────────────────────────────────────────────────────

    function test_CreateJob_Success() public {
        vm.prank(client);
        jobId = registry.createJob{value: PRICE}(agentId, bytes32(0));

        AgentRegistry.Job memory j = registry.getJob(jobId);
        assertEq(j.agentId,   agentId);
        assertEq(j.client,    client);
        assertEq(j.escrow,    PRICE);
        assertEq(uint8(j.status), uint8(AgentRegistry.JobStatus.Pending));
        assertEq(j.parentJobId, bytes32(0));
        assertGt(j.createdAt, 0);
        assertEq(j.completedAt, 0);
    }

    function test_CreateJob_EscrowsExactAmount() public {
        uint256 contractBalanceBefore = address(registry).balance;

        vm.prank(client);
        registry.createJob{value: PRICE}(agentId, bytes32(0));

        assertEq(address(registry).balance, contractBalanceBefore + PRICE);
    }

    function test_CreateJob_EmitsEvent() public {
        vm.prank(client);
        vm.expectEmit(false, true, true, true);
        emit AgentRegistry.JobCreated(bytes32(0), agentId, client, PRICE);
        registry.createJob{value: PRICE}(agentId, bytes32(0));
    }

    function test_CreateJob_RejectsUnderpayment() public {
        vm.prank(client);
        vm.expectRevert("Send exactly priceCTC");
        registry.createJob{value: PRICE - 1}(agentId, bytes32(0));
    }

    function test_CreateJob_RejectsOverpayment() public {
        vm.prank(client);
        vm.expectRevert("Send exactly priceCTC");
        registry.createJob{value: PRICE + 1}(agentId, bytes32(0));
    }

    function test_CreateJob_RejectsNonexistentAgent() public {
        vm.prank(client);
        vm.expectRevert("Agent not active");
        registry.createJob{value: PRICE}(bytes32(uint256(999)), bytes32(0));
    }

    function test_CreateJob_WithParentJobId() public {
        // First job
        vm.prank(client);
        bytes32 parentId = registry.createJob{value: PRICE}(agentId, bytes32(0));

        // Child job referencing parent
        vm.prank(client);
        bytes32 childId = registry.createJob{value: PRICE}(agentId, parentId);

        AgentRegistry.Job memory child = registry.getJob(childId);
        assertEq(child.parentJobId, parentId);
    }

    // ─── completeJob ─────────────────────────────────────────────────────────

    function _createPendingJob() internal returns (bytes32) {
        vm.prank(client);
        return registry.createJob{value: PRICE}(agentId, bytes32(0));
    }

    function test_CompleteJob_ReleasesEscrowToAgentOwner() public {
        bytes32 jId = _createPendingJob();
        uint256 ownerBalanceBefore = agentOwner.balance;

        vm.prank(client);
        registry.completeJob(jId);

        assertEq(agentOwner.balance, ownerBalanceBefore + PRICE);
    }

    function test_CompleteJob_UpdatesAgentStats() public {
        bytes32 jId = _createPendingJob();

        vm.prank(client);
        registry.completeJob(jId);

        AgentRegistry.Agent memory a = registry.getAgent(agentId);
        assertEq(a.jobsCompleted, 1);
        assertEq(a.totalEarned,   PRICE);
        assertEq(a.reputation,    5_000 + 50); // +50 bp
    }

    function test_CompleteJob_ReputationCapsAtMax() public {
        // Manually force reputation near max
        // Register a fresh agent, complete many jobs to hit cap
        vm.prank(agentOwner);
        bytes32 highRepAgentId = registry.registerAgent("High Rep", ENDPOINT, PRICE, CATEGORY, DESCRIPTION);

        // Simulate 100 completions by completing 100 jobs
        // 5000 + 100*50 = 10000 exactly
        uint256 completions = (10_000 - 5_000) / 50; // = 100
        for (uint256 i = 0; i < completions + 5; i++) {
            vm.prank(client);
            bytes32 jId2 = registry.createJob{value: PRICE}(highRepAgentId, bytes32(0));
            vm.prank(client);
            registry.completeJob(jId2);
        }

        AgentRegistry.Agent memory a = registry.getAgent(highRepAgentId);
        assertEq(a.reputation, 10_000); // must not exceed
    }

    function test_CompleteJob_UpdatesStatus() public {
        bytes32 jId = _createPendingJob();
        vm.prank(client);
        registry.completeJob(jId);

        AgentRegistry.Job memory j = registry.getJob(jId);
        assertEq(uint8(j.status), uint8(AgentRegistry.JobStatus.Complete));
        assertGt(j.completedAt, 0);
    }

    function test_CompleteJob_EmitsEvent() public {
        bytes32 jId = _createPendingJob();
        vm.prank(client);
        vm.expectEmit(true, false, false, false);
        emit AgentRegistry.JobCompleted(jId);
        registry.completeJob(jId);
    }

    function test_CompleteJob_RejectsNonClient() public {
        bytes32 jId = _createPendingJob();
        vm.prank(stranger);
        vm.expectRevert("Only client can complete");
        registry.completeJob(jId);
    }

    function test_CompleteJob_RejectsAgentOwnerCalling() public {
        bytes32 jId = _createPendingJob();
        vm.prank(agentOwner);
        vm.expectRevert("Only client can complete");
        registry.completeJob(jId);
    }

    function test_CompleteJob_RejectsAlreadyCompleted() public {
        bytes32 jId = _createPendingJob();
        vm.prank(client);
        registry.completeJob(jId);

        vm.prank(client);
        vm.expectRevert("Job not pending");
        registry.completeJob(jId);
    }

    // ─── failJob ─────────────────────────────────────────────────────────────

    function test_FailJob_RefundsClient() public {
        bytes32 jId = _createPendingJob();
        uint256 clientBalanceBefore = client.balance;

        vm.prank(agentOwner);
        registry.failJob(jId);

        assertEq(client.balance, clientBalanceBefore + PRICE);
    }

    function test_FailJob_UpdatesAgentStats() public {
        bytes32 jId = _createPendingJob();
        vm.prank(agentOwner);
        registry.failJob(jId);

        AgentRegistry.Agent memory a = registry.getAgent(agentId);
        assertEq(a.jobsFailed,  1);
        assertEq(a.reputation,  5_000 - 100); // -100 bp
    }

    function test_FailJob_ReputationFloorAtZero() public {
        // Register agent, fail enough jobs to hit 0
        vm.prank(agentOwner);
        bytes32 lowRepAgentId = registry.registerAgent("Low Rep", ENDPOINT, PRICE, CATEGORY, DESCRIPTION);

        uint256 failures = (5_000 / 100) + 5; // 55 failures
        for (uint256 i = 0; i < failures; i++) {
            vm.prank(client);
            bytes32 jId2 = registry.createJob{value: PRICE}(lowRepAgentId, bytes32(0));
            vm.prank(agentOwner);
            registry.failJob(jId2);
        }

        AgentRegistry.Agent memory a = registry.getAgent(lowRepAgentId);
        assertEq(a.reputation, 0); // must not underflow
    }

    function test_FailJob_UpdatesStatus() public {
        bytes32 jId = _createPendingJob();
        vm.prank(agentOwner);
        registry.failJob(jId);

        AgentRegistry.Job memory j = registry.getJob(jId);
        assertEq(uint8(j.status), uint8(AgentRegistry.JobStatus.Failed));
        assertGt(j.completedAt, 0);
    }

    function test_FailJob_EmitsEvent() public {
        bytes32 jId = _createPendingJob();
        vm.prank(agentOwner);
        vm.expectEmit(true, false, false, false);
        emit AgentRegistry.JobFailed(jId);
        registry.failJob(jId);
    }

    function test_FailJob_RejectsClient() public {
        bytes32 jId = _createPendingJob();
        vm.prank(client);
        vm.expectRevert("Only agent owner can fail");
        registry.failJob(jId);
    }

    function test_FailJob_RejectsStranger() public {
        bytes32 jId = _createPendingJob();
        vm.prank(stranger);
        vm.expectRevert("Only agent owner can fail");
        registry.failJob(jId);
    }

    function test_FailJob_RejectsAlreadyFailed() public {
        bytes32 jId = _createPendingJob();
        vm.prank(agentOwner);
        registry.failJob(jId);

        vm.prank(agentOwner);
        vm.expectRevert("Job not pending");
        registry.failJob(jId);
    }

    function test_CannotCompleteAfterFail() public {
        bytes32 jId = _createPendingJob();
        vm.prank(agentOwner);
        registry.failJob(jId);

        vm.prank(client);
        vm.expectRevert("Job not pending");
        registry.completeJob(jId);
    }

    // ─── Views ───────────────────────────────────────────────────────────────

    function test_GetReputationPercent() public view {
        uint256 pct = registry.getReputationPercent(agentId);
        assertEq(pct, 50); // 5000 bp = 50%
    }

    function test_GetActiveAgentCount() public {
        assertEq(registry.getActiveAgentCount(), 1);

        vm.prank(agentOwner);
        registry.deactivateAgent(agentId);

        assertEq(registry.getActiveAgentCount(), 0);
    }

    // ─── Reentrancy ───────────────────────────────────────────────────────────

    function test_CompleteJob_ReentrancyProtected() public {
        // Deploy a malicious receiver contract as agentOwner
        MaliciousReceiver attacker = new MaliciousReceiver(address(registry));
        vm.deal(address(attacker), 10 ether);
        vm.deal(client, 10 ether);

        // Register agent owned by attacker
        vm.prank(address(attacker));
        bytes32 attackAgentId = registry.registerAgent("Evil Agent", ENDPOINT, PRICE, CATEGORY, DESCRIPTION);

        // Client creates job
        vm.prank(client);
        bytes32 jId = registry.createJob{value: PRICE}(attackAgentId, bytes32(0));

        // Set the jobId to attack
        attacker.setTargetJob(jId);

        // Complete — should NOT allow reentrancy
        vm.prank(client);
        registry.completeJob(jId); // Should complete once without reentrancy

        // Job should be Complete (not re-entered to drain)
        AgentRegistry.Job memory j = registry.getJob(jId);
        assertEq(uint8(j.status), uint8(AgentRegistry.JobStatus.Complete));
        // Reentrancy was blocked — only 1 payout happened
        assertEq(attacker.reentrancyAttempts(), 1);
    }

    // ─── Fuzz Tests ──────────────────────────────────────────────────────────

    function testFuzz_CreateAndCompleteJob(uint256 price) public {
        price = bound(price, 1, 100 ether);

        vm.prank(agentOwner);
        bytes32 fuzzAgentId = registry.registerAgent("Fuzz Agent", ENDPOINT, price, CATEGORY, DESCRIPTION);

        vm.deal(client, price);
        vm.prank(client);
        bytes32 jId = registry.createJob{value: price}(fuzzAgentId, bytes32(0));

        uint256 ownerBefore = agentOwner.balance;
        vm.prank(client);
        registry.completeJob(jId);

        assertEq(agentOwner.balance, ownerBefore + price);
    }

    function testFuzz_RegisterMultipleAgents(uint8 count) public {
        vm.assume(count > 0 && count < 50);
        for (uint256 i = 0; i < count; i++) {
            // Use warp to avoid same-block timestamp collision
            vm.warp(block.timestamp + i + 1);
            vm.prank(agentOwner);
            registry.registerAgent(
                string(abi.encodePacked("Agent ", i)),
                ENDPOINT, PRICE, CATEGORY, DESCRIPTION
            );
        }
        // +1 for the one registered in setUp
        assertEq(registry.getAgentIds().length, uint256(count) + 1);
    }
}

// ─── Malicious Receiver (for reentrancy test) ─────────────────────────────────

contract MaliciousReceiver {
    AgentRegistry public registry;
    bytes32 public targetJob;
    uint256 public reentrancyAttempts;

    constructor(address _registry) {
        registry = AgentRegistry(_registry);
    }

    function setTargetJob(bytes32 jId) external {
        targetJob = jId;
    }

    // Called when ETH is received — tries to re-enter completeJob
    receive() external payable {
        reentrancyAttempts++;
        if (reentrancyAttempts < 3) {
            // This should revert due to nonReentrant guard
            try registry.completeJob(targetJob) {} catch {}
        }
    }
}
