
import { Type, Schema } from "@google/genai";
import { NodeType } from "../types";

// Response Schemas
export const graphSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    nodes: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          label: { type: Type.STRING, description: "MAX 2-3 WORDS. Very concise." },
          type: { type: Type.STRING, enum: Object.values(NodeType).filter(t => t !== NodeType.CORE) }, 
          explanation: { type: Type.STRING, description: "Plain language explanation (2-3 sentences)" },
          analogy: { type: Type.STRING, description: "A concrete real-world analogy" },
          microQuest: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              description: { type: Type.STRING, description: "A 5-minute active experiment or thought exercise" }
            },
            required: ["title", "description"]
          }
        },
        required: ["id", "label", "type", "explanation", "analogy", "microQuest"]
      }
    },
    links: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          source: { type: Type.STRING, description: "ID of source node" },
          target: { type: Type.STRING, description: "ID of target node" },
          relation: { type: Type.STRING }
        },
        required: ["source", "target", "relation"]
      }
    }
  },
  required: ["nodes", "links"]
};

export const feedbackSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    score: { type: Type.INTEGER },
    feedback: { type: Type.STRING },
    missingConcepts: { type: Type.ARRAY, items: { type: Type.STRING } },
    recommendedNodeIds: { type: Type.ARRAY, items: { type: Type.STRING } }
  },
  required: ["score", "feedback", "missingConcepts", "recommendedNodeIds"]
};
