
import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI, Type, Schema } from "@google/genai";
import GraphCanvas, { getNodeColor } from './GraphCanvas';
import { GraphState, NodeData, NodeType, FeedbackResponse } from './types';
import { 
  SparklesIcon, 
  BeakerIcon, 
  BookOpenIcon, 
  XMarkIcon,
  MagnifyingGlassIcon,
  LightBulbIcon,
  ChatBubbleBottomCenterTextIcon,
  ArrowRightIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  FunnelIcon,
  EyeSlashIcon
} from '@heroicons/react/24/outline';

// --- Gemini Configuration ---
const genAI = new GoogleGenAI({ apiKey: process.env.API_KEY });

// Response Schemas
const graphSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    nodes: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          label: { type: Type.STRING, description: "MAX 2-3 WORDS. Very concise." }, // Strict instruction for shortness
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

const feedbackSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    score: { type: Type.INTEGER },
    feedback: { type: Type.STRING },
    missingConcepts: { type: Type.ARRAY, items: { type: Type.STRING } },
    recommendedNodeIds: { type: Type.ARRAY, items: { type: Type.STRING } }
  },
  required: ["score", "feedback", "missingConcepts", "recommendedNodeIds"]
};

const App = () => {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [graphData, setGraphData] = useState<GraphState>({ nodes: [], links: [] });
  const [selectedNode, setSelectedNode] = useState<NodeData | null>(null);
  const [dimensions, setDimensions] = useState({ width: window.innerWidth, height: window.innerHeight });
  const [showLegend, setShowLegend] = useState(true);
  const [activeLegendTypes, setActiveLegendTypes] = useState<NodeType[]>([]); // For filtering
  const [filterUnvisited, setFilterUnvisited] = useState(false); // New state for unvisited filter
  
  // Test Understanding State
  const [testInput, setTestInput] = useState('');
  const [feedback, setFeedback] = useState<FeedbackResponse | null>(null);
  const [feedbackLoading, setFeedbackLoading] = useState(false);

  useEffect(() => {
    const handleResize = () => setDimensions({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const toggleLegendType = (type: NodeType) => {
    setActiveLegendTypes(prev => 
      prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]
    );
  };

  const handleInitialQuery = async (e?: React.FormEvent, overrideInput?: string) => {
    if (e) e.preventDefault();
    const query = overrideInput || input;
    if (!query.trim()) return;

    setLoading(true);
    setSelectedNode(null);
    setInput(query); // Sync input if override used

    try {
      const existingLabels = graphData.nodes.map(n => n.label).join(", ");
      
      const prompt = `
        User Question: "${query}"
        Existing Context (Graph Nodes): [${existingLabels}]
        
        Task: Create a rich knowledge graph to answer the question.
        
        CRITICAL: Use ONLY these Node Types to diversify the learning:
        1. ANALOGY: Turn the abstract into something tactile.
        2. EXPERIMENT: Give agency, not just words.
        3. HISTORY: Tell the story of how humans learned this.
        4. APPLICATION: Connect to reality.
        5. DEBATE: Expose the edges of certainty.
        6. MISCONCEPTION: Let the user unlearn something.
        7. EXAMPLE: Concrete case, anecdote, or narrative.
        
        Rules:
        - KEEP NODE LABELS VERY SHORT (1-3 words max).
        - If the question relates to the existing context, connect new nodes to the existing ones.
        - If it's a new topic, create a new cluster.
        - Break the answer down into atomic concepts using the types above.
        - Return around 5-7 high-quality nodes.
      `;

      const response = await genAI.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: graphSchema,
          systemInstruction: "You are the Curiosity Engine. You visualize knowledge as a graph. Focus on connections, causality, and multimodality. Ensure high variety in Node Types. Keep labels VERY short."
        }
      });

      const data = JSON.parse(response.text) as GraphState;
      
      let newNodes = data.nodes;
      let newLinks = data.links;

      if (graphData.nodes.length === 0) {
        const rootId = 'root-' + Date.now();
        const rootNode: NodeData = {
           id: rootId,
           label: query, // Root can be slightly longer, but ideally user typed a short query
           type: NodeType.CORE,
           explanation: "The starting point of your curiosity.",
           analogy: "The seed.",
           microQuest: { title: "Reflect", description: "What made you ask this?" },
           x: dimensions.width / 2,
           y: dimensions.height / 2,
           visited: true // Root is visited by default
        };
        // Link generated nodes to this root
        const linksToRoot = newNodes.map(n => ({
            source: rootId,
            target: n.id,
            relation: "origin"
        }));
        
        newNodes = [rootNode, ...newNodes];
        newLinks = [...newLinks, ...linksToRoot];
      }

      setGraphData(prev => {
        const existingIds = new Set(prev.nodes.map(n => n.id));
        const filteredNewNodes = newNodes.filter(n => !existingIds.has(n.id));
        
        const existingLinks = new Set(prev.links.map(l => 
          `${(typeof l.source === 'object' ? l.source.id : l.source)}-${(typeof l.target === 'object' ? l.target.id : l.target)}`
        ));
        const filteredNewLinks = newLinks.filter(l => !existingLinks.has(`${l.source}-${l.target}`));

        return {
          nodes: [...prev.nodes, ...filteredNewNodes],
          links: [...prev.links, ...filteredNewLinks]
        };
      });
      
      if (!overrideInput) setInput('');
    } catch (err) {
      console.error("Gemini Error:", err);
    } finally {
      setLoading(false);
    }
  };

  const expandNode = async (node: NodeData) => {
    setLoading(true);
    // Note: Node is already marked visited in handleNodeClick, but good to reinforce here if triggered elsewhere
    setGraphData(prev => ({
      ...prev,
      nodes: prev.nodes.map(n => n.id === node.id ? { ...n, visited: true } : n)
    }));

    try {
      const prompt = `
        Selected Concept: "${node.label}"
        Type: "${node.type}"
        Explanation: "${node.explanation}"
        Existing Graph: [${graphData.nodes.map(n => n.label).join(', ')}]

        Task: Expand deeper into this specific concept.
        
        CRITICAL: Use ONLY these Node Types:
        1. ANALOGY: Turn the abstract into something tactile.
        2. EXPERIMENT: Give agency, not just words.
        3. HISTORY: Tell the story of how humans learned this.
        4. APPLICATION: Connect to reality.
        5. DEBATE: Expose the edges of certainty.
        6. MISCONCEPTION: Let the user unlearn something.
        7. EXAMPLE: Concrete case, anecdote, or narrative.
        
        Rules:
        - KEEP LABELS SHORT (1-3 words).
        - Generate 3-5 NEW child nodes.
        - Connect them back to the ID "${node.id}".
        - Do not duplicate existing nodes.
        - Try to pick types that are NOT yet present for this branch.
      `;

      const response = await genAI.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: graphSchema
        }
      });

      const data = JSON.parse(response.text) as GraphState;

      setGraphData(prev => {
        const existingIds = new Set(prev.nodes.map(n => n.id));
        const newNodes = data.nodes.filter(n => !existingIds.has(n.id));
        
        const validLinks = data.links.filter(l => 
          (existingIds.has(l.source as string) || newNodes.find(n => n.id === l.source)) &&
          (existingIds.has(l.target as string) || newNodes.find(n => n.id === l.target))
        );

        return {
          nodes: [...prev.nodes, ...newNodes],
          links: [...prev.links, ...validLinks]
        };
      });

    } catch (err) {
      console.error("Expansion Error:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleNodeClick = (node: NodeData) => {
    setSelectedNode(node);
    
    // Mark as visited when clicked
    setGraphData(prev => ({
      ...prev,
      nodes: prev.nodes.map(n => n.id === node.id ? { ...n, visited: true } : n)
    }));

    setTestInput('');
    setFeedback(null);
  };

  const handleTestUnderstanding = async () => {
    if (!testInput.trim() || !selectedNode) return;
    setFeedbackLoading(true);
    
    try {
      const prompt = `
        Concept: "${selectedNode.label}"
        Graph Context: ${JSON.stringify(graphData.nodes.map(n => ({ id: n.id, label: n.label })))}
        User Explanation: "${testInput}"

        Task: Evaluate the user's understanding.
        1. Score 0-100.
        2. Give constructive feedback.
        3. Recommend existing node IDs to visit.
      `;

      const response = await genAI.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: feedbackSchema
        }
      });

      setFeedback(JSON.parse(response.text));
    } catch (err) {
      console.error(err);
    } finally {
      setFeedbackLoading(false);
    }
  };

  const isGraphEmpty = graphData.nodes.length === 0;

  return (
    <div className="relative w-full h-screen bg-space-950 text-slate-100 font-sans overflow-hidden">
      
      {/* Background Noise & Gradient */}
      <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 pointer-events-none mix-blend-overlay"></div>
      <div className="absolute inset-0 bg-gradient-to-b from-space-950 via-space-900 to-space-950 opacity-80 pointer-events-none"></div>
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-neon-blue/5 rounded-full blur-[120px] pointer-events-none"></div>

      {/* Main Canvas */}
      <div className={`absolute inset-0 z-0 transition-opacity duration-1000 ${isGraphEmpty ? 'opacity-0' : 'opacity-100'}`}>
        <GraphCanvas 
          data={graphData} 
          onNodeClick={handleNodeClick}
          width={dimensions.width}
          height={dimensions.height}
          activeTypes={activeLegendTypes}
          filterUnvisited={filterUnvisited}
        />
      </div>

      {/* Welcome / Empty State */}
      {isGraphEmpty && !loading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center z-10 p-6">
          <div className="text-center max-w-2xl animate-fade-in-up">
            <h1 className="text-5xl md:text-7xl font-display font-bold text-transparent bg-clip-text bg-gradient-to-r from-white via-slate-200 to-slate-400 mb-6 drop-shadow-2xl">
              Curiosity Engine
            </h1>
            <p className="text-slate-400 text-lg md:text-xl mb-10 font-light leading-relaxed">
              Don't just get answers. Build a universe of knowledge.<br/>
              Ask a question to start your journey.
            </p>
            
            <div className="flex flex-wrap justify-center gap-3">
              {[
                "Why do stars twinkle?", 
                "Is time an illusion?", 
                "How do octopuses think?",
                "What is quantum entanglement?"
              ].map((q, i) => (
                <button
                  key={q}
                  onClick={() => handleInitialQuery(undefined, q)}
                  className="px-5 py-2.5 rounded-full bg-space-800/40 backdrop-blur-md border border-space-700/50 hover:border-neon-blue/50 hover:bg-space-800/80 text-slate-300 text-sm transition-all duration-300 hover:-translate-y-1 shadow-lg shadow-black/20"
                  style={{ animationDelay: `${i * 100}ms` }}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Legend Toggle / Display */}
      {!isGraphEmpty && (
        <div className="absolute top-6 left-6 z-10 flex flex-col items-start gap-2">
            <button 
                onClick={() => setShowLegend(!showLegend)}
                className="p-2 bg-space-900/50 backdrop-blur-md border border-space-800 rounded-lg text-slate-400 hover:text-white transition flex items-center gap-2"
            >
                <FunnelIcon className="w-4 h-4" />
                <span className="text-xs font-bold uppercase tracking-wider">Filter & Legend</span>
            </button>
            
            {showLegend && (
                <div className="bg-space-900/80 backdrop-blur-xl border border-space-800 p-4 rounded-2xl shadow-2xl animate-fadeIn">
                    <div className="flex items-center justify-between mb-3">
                       <p className="text-[10px] text-slate-500 uppercase font-bold tracking-widest">Select to filter</p>
                    </div>
                    
                    {/* Unvisited Filter Toggle */}
                    <button 
                        onClick={() => setFilterUnvisited(!filterUnvisited)}
                        className={`w-full flex items-center justify-between p-2 rounded-lg border mb-3 transition-all ${filterUnvisited ? 'bg-neon-blue/10 border-neon-blue/50 text-neon-blue' : 'bg-white/5 border-transparent text-slate-400 hover:bg-white/10'}`}
                    >
                        <div className="flex items-center gap-2">
                            <EyeSlashIcon className="w-4 h-4" />
                            <span className="text-xs font-bold">Unvisited Only</span>
                        </div>
                        {filterUnvisited && <CheckCircleIcon className="w-4 h-4" />}
                    </button>

                    <div className="grid grid-cols-2 gap-x-2 gap-y-2">
                    {Object.values(NodeType).filter(t => t !== NodeType.CORE).map(type => {
                        const isActive = activeLegendTypes.length === 0 || activeLegendTypes.includes(type);
                        return (
                            <button 
                                key={type} 
                                onClick={() => toggleLegendType(type)}
                                className={`flex items-center space-x-2.5 p-1.5 rounded-lg transition-all duration-200 border ${isActive ? 'bg-white/5 border-white/10' : 'opacity-40 border-transparent hover:opacity-70'}`}
                            >
                                <div 
                                    className="w-2.5 h-2.5 rounded-full transition-transform" 
                                    style={{ 
                                        backgroundColor: getNodeColor(type), 
                                        boxShadow: isActive ? `0 0 8px ${getNodeColor(type)}` : 'none',
                                        transform: isActive ? 'scale(1)' : 'scale(0.8)'
                                    }} 
                                />
                                <span className={`text-[10px] font-medium capitalize tracking-wide ${isActive ? 'text-slate-200' : 'text-slate-500'}`}>
                                    {type.toLowerCase()}
                                </span>
                                {activeLegendTypes.includes(type) && (
                                    <CheckCircleIcon className="w-3 h-3 text-white ml-auto" />
                                )}
                            </button>
                        );
                    })}
                    </div>
                    {(activeLegendTypes.length > 0 || filterUnvisited) && (
                        <button 
                            onClick={() => { setActiveLegendTypes([]); setFilterUnvisited(false); }}
                            className="w-full mt-3 text-[10px] text-slate-400 hover:text-white py-1 border-t border-white/5"
                        >
                            Reset Filters
                        </button>
                    )}
                </div>
            )}
        </div>
      )}

      {/* Floating Input Bar */}
      <div className={`absolute bottom-8 left-1/2 transform -translate-x-1/2 w-full max-w-2xl px-4 z-20 transition-all duration-500 ${isGraphEmpty ? 'translate-y-0' : 'translate-y-0'}`}>
        <form onSubmit={(e) => handleInitialQuery(e)} className="relative group">
          <div className="absolute -inset-1 bg-gradient-to-r from-neon-blue via-neon-purple to-neon-pink rounded-full blur opacity-20 group-hover:opacity-40 transition duration-1000"></div>
          <div className="relative flex items-center bg-space-900/80 backdrop-blur-xl rounded-full border border-white/10 shadow-2xl overflow-hidden ring-1 ring-white/5 group-focus-within:ring-neon-blue/50 transition-all">
            <div className="pl-5 pr-3 text-neon-blue">
                {loading ? (
                    <div className="w-5 h-5 border-2 border-neon-blue border-t-transparent rounded-full animate-spin"></div>
                ) : (
                    <SparklesIcon className="h-6 w-6" />
                )}
            </div>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask a question to expand the universe..."
              className="w-full bg-transparent border-none focus:ring-0 text-slate-100 placeholder-slate-500 py-4 px-2 text-lg outline-none font-medium"
              disabled={loading}
            />
            <div className="pr-4">
                <button 
                    type="submit"
                    disabled={!input.trim() || loading}
                    className="p-2 bg-space-800 rounded-full text-slate-400 hover:text-white hover:bg-neon-blue transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <ArrowRightIcon className="w-5 h-5" />
                </button>
            </div>
          </div>
        </form>
      </div>

      {/* Right Panel (Slide Over) */}
      <div 
        className={`fixed right-0 top-0 h-full w-full md:w-[500px] bg-space-950/80 backdrop-blur-2xl border-l border-white/10 shadow-2xl p-0 overflow-y-auto transform transition-transform duration-500 ease-spring z-30 ${selectedNode ? 'translate-x-0' : 'translate-x-full'}`}
      >
         {selectedNode && (
           <div className="min-h-full flex flex-col">
             {/* Sticky Header */}
             <div className="sticky top-0 z-20 bg-space-950/90 backdrop-blur-md border-b border-white/5 px-6 py-4 flex items-start justify-between">
                <div>
                    <span 
                        className="inline-block px-2.5 py-1 rounded-md text-[10px] font-bold tracking-widest uppercase border mb-2" 
                        style={{ 
                            borderColor: getNodeColor(selectedNode.type) + '44',
                            backgroundColor: getNodeColor(selectedNode.type) + '11', 
                            color: getNodeColor(selectedNode.type) 
                        }}
                    >
                        {selectedNode.type}
                    </span>
                    <h2 className="text-3xl font-display font-bold text-white leading-tight drop-shadow-lg">{selectedNode.label}</h2>
                </div>
                <button 
                    onClick={() => setSelectedNode(null)} 
                    className="p-2 -mr-2 rounded-full hover:bg-white/5 transition text-slate-400 hover:text-white"
                >
                    <XMarkIcon className="w-6 h-6" />
                </button>
             </div>
             
             <div className="p-6 space-y-8 flex-grow">
                {/* Explanation */}
                <div className="animate-fadeIn" style={{ animationDelay: '0.1s' }}>
                    <p className="text-lg text-slate-200 leading-relaxed font-light">{selectedNode.explanation}</p>
                </div>

                {/* Cards Grid */}
                <div className="grid gap-4">
                    {/* Analogy Card */}
                    <div className="group relative p-5 bg-gradient-to-br from-amber-900/10 to-transparent rounded-2xl border border-amber-500/20 hover:border-amber-500/40 transition-all duration-300">
                        <div className="absolute top-4 right-4 text-amber-500/20 group-hover:text-amber-500/40 transition">
                            <LightBulbIcon className="w-8 h-8" />
                        </div>
                        <h3 className="text-xs font-bold text-amber-500 uppercase tracking-widest mb-2 flex items-center">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 mr-2"></span>
                            Analogy
                        </h3>
                        <p className="text-slate-300 italic font-medium relative z-10">"{selectedNode.analogy}"</p>
                    </div>

                    {/* Micro-Quest Card */}
                    <div className="group relative p-5 bg-gradient-to-br from-emerald-900/10 to-transparent rounded-2xl border border-emerald-500/20 hover:border-emerald-500/40 transition-all duration-300">
                         <div className="absolute top-4 right-4 text-emerald-500/20 group-hover:text-emerald-500/40 transition">
                            <BeakerIcon className="w-8 h-8" />
                        </div>
                        <h3 className="text-xs font-bold text-emerald-500 uppercase tracking-widest mb-2 flex items-center">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-2"></span>
                            Micro-Quest: {selectedNode.microQuest.title}
                        </h3>
                        <p className="text-slate-300 relative z-10 text-sm leading-relaxed">{selectedNode.microQuest.description}</p>
                    </div>
                </div>

                {/* Primary Action */}
                <button 
                    onClick={() => expandNode(selectedNode)}
                    disabled={loading}
                    className="w-full group relative overflow-hidden rounded-xl bg-slate-100 py-4 px-4 font-display font-bold text-space-950 shadow-xl transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed"
                >
                    <div className="absolute inset-0 bg-gradient-to-r from-neon-blue/20 via-neon-purple/20 to-neon-pink/20 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000"></div>
                    <div className="relative flex items-center justify-center space-x-2">
                        {loading ? (
                             <>
                                <div className="w-4 h-4 border-2 border-space-950 border-t-transparent rounded-full animate-spin"></div>
                                <span>Generating Connections...</span>
                             </>
                        ) : (
                            <>
                                <MagnifyingGlassIcon className="w-5 h-5 stroke-2" />
                                <span>Explore this branch</span>
                            </>
                        )}
                    </div>
                </button>

                {/* Interactive Learning Check */}
                <div className="border-t border-white/10 pt-8 pb-4">
                    <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center">
                        <ChatBubbleBottomCenterTextIcon className="w-4 h-4 mr-2" />
                        Verify Knowledge
                    </h3>
                    <div className="relative">
                        <textarea 
                            value={testInput}
                            onChange={(e) => setTestInput(e.target.value)}
                            placeholder={`Explain "${selectedNode.label}" in your own words...`}
                            className="w-full bg-space-900/50 border border-space-800 rounded-xl p-4 text-slate-200 placeholder-slate-600 focus:border-neon-blue focus:ring-1 focus:ring-neon-blue transition min-h-[100px] text-sm resize-none"
                        />
                        <button 
                            onClick={handleTestUnderstanding}
                            disabled={feedbackLoading || !testInput.trim()}
                            className="absolute bottom-3 right-3 px-4 py-1.5 bg-space-800 hover:bg-neon-blue text-xs text-white rounded-lg font-medium transition disabled:opacity-0"
                        >
                            {feedbackLoading ? '...' : 'Check'}
                        </button>
                    </div>

                    {feedback && (
                        <div className={`mt-4 p-4 rounded-xl border ${feedback.score > 70 ? 'bg-emerald-950/30 border-emerald-500/30' : 'bg-amber-950/30 border-amber-500/30'} animate-fade-in-up`}>
                            <div className="flex items-center justify-between mb-2">
                                <span className={`flex items-center text-xs font-bold uppercase tracking-wider ${feedback.score > 70 ? 'text-emerald-400' : 'text-amber-400'}`}>
                                    {feedback.score > 70 ? <CheckCircleIcon className="w-4 h-4 mr-2"/> : <ExclamationCircleIcon className="w-4 h-4 mr-2"/>}
                                    Feedback ({feedback.score}%)
                                </span>
                            </div>
                            <p className="text-slate-300 text-sm leading-relaxed mb-3">{feedback.feedback}</p>
                            
                            {feedback.recommendedNodeIds.length > 0 && (
                                <div className="flex flex-wrap gap-2">
                                    {feedback.recommendedNodeIds.map(id => {
                                        const n = graphData.nodes.find(node => node.id === id);
                                        if (!n) return null;
                                        return (
                                            <button 
                                                key={id}
                                                onClick={() => {
                                                    setSelectedNode(n);
                                                    setTestInput('');
                                                    setFeedback(null);
                                                }}
                                                className="px-2 py-1 bg-white/5 hover:bg-white/10 border border-white/10 rounded-md text-[10px] text-slate-300 transition"
                                            >
                                                Review: {n.label}
                                            </button>
                                        )
                                    })}
                                </div>
                            )}
                        </div>
                    )}
                </div>
             </div>
           </div>
         )}
      </div>
    </div>
  );
};

export default App;
