import { PenTool, Twitter, Activity, FileImage, Megaphone, Video, TrendingUp, BarChart, Palette, Cpu, Zap, type LucideIcon } from 'lucide-react';

export const AgentIconMap: Record<string, LucideIcon> = {
  // kebab-case agent IDs
  'seo-blog-agent':           PenTool,
  'twitter-thread-agent':     Twitter,
  'tweet-update-agent':       Activity,
  'infographic-agent':        FileImage,
  'marketing-campaign-agent': Megaphone,
  'ugc-video-agent':          Video,
  'pitch-agent':              TrendingUp,
  'analytics-agent':          BarChart,
  'canva-connect':            Palette,
  manager:                    Cpu,
  // camelCase tool IDs (from /api/tools)
  seoBlog:                    PenTool,
  twitterThread:              Twitter,
  tweetUpdate:                Activity,
  infographicPrompt:          FileImage,
  marketingCampaign:          Megaphone,
  ugcVideoPrompt:             Video,
  pitch:                      TrendingUp,
  ghostWriter:                Cpu,
  emailNewsletter:            Megaphone,
  copywriting:                PenTool,
};

export const getAgentIcon = (id: string): LucideIcon => {
  const baseId = id.toLowerCase();
  return AgentIconMap[baseId] || Zap;
};

export const AgentColors: Record<string, string> = {
  // kebab-case
  'seo-blog-agent':           '#6EE7B7',
  'twitter-thread-agent':     '#60A5FA',
  'tweet-update-agent':       '#A78BFA',
  'infographic-agent':        '#FB923C',
  'marketing-campaign-agent': '#F472B6',
  'ugc-video-agent':          '#34D399',
  'pitch-agent':              '#FBBF24',
  'analytics-agent':          '#34D399',
  'canva-connect':            '#ec4899',
  manager:                    '#6EE7B7',
  // camelCase
  seoBlog:                    '#6EE7B7',
  twitterThread:              '#60A5FA',
  tweetUpdate:                '#A78BFA',
  infographicPrompt:          '#FB923C',
  marketingCampaign:          '#F472B6',
  ugcVideoPrompt:             '#34D399',
  pitch:                      '#FBBF24',
  ghostWriter:                '#9CA3AF',
  emailNewsletter:            '#F472B6',
  copywriting:                '#6EE7B7',
};

export const getAgentColor = (id: string) => {
  const baseId = id.toLowerCase();
  return AgentColors[baseId] || '#64748b';
};
