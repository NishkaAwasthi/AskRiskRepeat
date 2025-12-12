
import { SimulationNodeDatum, SimulationLinkDatum } from 'd3';

export enum NodeType {
  CORE = 'CORE',               // Root node
  ANALOGY = 'ANALOGY',         // Turn the abstract into something tactile
  EXPERIMENT = 'EXPERIMENT',   // Give agency, not just words
  HISTORY = 'HISTORY',         // Tell the story of how humans learned this
  APPLICATION = 'APPLICATION', // Connect to reality
  DEBATE = 'DEBATE',           // Expose the edges of certainty
  MISCONCEPTION = 'MISCONCEPTION', // Let the user unlearn something
  EXAMPLE = 'EXAMPLE'          // Concrete case, anecdote, or narrative
}

export interface MicroQuest {
  title: string;
  description: string;
}

export interface NodeData extends SimulationNodeDatum {
  id: string;
  label: string;
  type: NodeType;
  explanation: string; // Plain language summary
  analogy: string;     // Real world analogy
  microQuest: MicroQuest;
  visited?: boolean;   // To track learning progress
  isFavorite?: boolean;
}

export interface LinkData extends SimulationLinkDatum<NodeData> {
  source: string | NodeData;
  target: string | NodeData;
  relation: string;
}

export interface GraphState {
  nodes: NodeData[];
  links: LinkData[];
}

export interface FeedbackResponse {
  score: number; // 0-100
  feedback: string;
  missingConcepts: string[];
  recommendedNodeIds: string[]; // Nodes in the current graph the user should look at
}
