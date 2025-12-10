import React, { useState, useEffect } from 'react';
import { GoogleGenAI, Type, Schema } from "@google/genai";
import GraphCanvas, { getNodeColor } from './GraphCanvas';
import { GraphState, NodeData, NodeType, FeedbackResponse } from './types';
import { 
  SparklesIcon, 
  BeakerIcon, 
  XMarkIcon,
  MagnifyingGlassIcon,
  LightBulbIcon,
  ChatBubbleBottomCenterTextIcon,
  ArrowRightIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  FunnelIcon,
  EyeSlashIcon,
  SunIcon,
  MoonIcon,
  ArrowPathIcon
} from '@heroicons/react/24/outline';

// --- Gemini Configuration ---
const genAI = new GoogleGenAI({ apiKey: process.env.API_KEY });

// Question Bank for Suggestions
const QUESTION_BANK = [
  "Why do cats purr?",
  "How does gravity work?",
  "Is math invented or discovered?",
  "What is a black hole?",
  "Why is the sky blue?",
  "Do plants feel pain?",
  "What is consciousness?",
  "How do airplanes fly?",
  "Why do we dream?",
  "What is money?",
  "How does the internet work?",
  "Why is ice slippery?",
  "What are emotions?",
  "How do batteries store energy?",
  "Why do we sleep?",
  "What is a quantum computer?",
  "How do vaccines work?",
  "Why does time move forward?",
  "What is fire?",
  "How do eyes see color?",
  "Why is the ocean salty?",
  "How do birds navigate?",
  "What is deja vu?"
];

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
  const [activeLegendTypes, setActiveLegendTypes] = useState<NodeType[]>([]);
  const [filterUnvisited, setFilterUnvisited] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [suggestedQuestions, setSuggestedQuestions] = useState<string[]>([]);
  
  const [testInput, setTestInput] = useState('');
  const [feedback, setFeedback] = useState<FeedbackResponse | null>(null);
  const [feedbackLoading, setFeedbackLoading] = useState(false);

  useEffect(() => {
    const handleResize = () => setDimensions({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', handleResize);
    refreshSuggestions();
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const refreshSuggestions = () => {
    const shuffled = [...QUESTION_BANK].sort(() => 0.5 - Math.random());
    setSuggestedQuestions(shuffled.slice(0, 3));
  };

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
    setInput(query); 

    try {
      const existingLabels = graphData.nodes.map(n => n.label).join(", ");
      
      const prompt = `
        User Question: "${query}"
        Existing Context (Graph Nodes): [${existingLabels}]
        
        Task: Create a playful but educational knowledge graph.
        
        CRITICAL: Use ONLY these Node Types:
        1. ANALOGY: Turn the abstract into something tactile.
        2. EXPERIMENT: Give agency, not just words.
        3. HISTORY: Tell the story of how humans learned this.
        4. APPLICATION: Connect to reality.
        5. DEBATE: Expose the edges of certainty.
        6. MISCONCEPTION: Let the user unlearn something.
        7. EXAMPLE: Concrete case, anecdote, or narrative.
        
        Rules:
        - KEEP NODE LABELS VERY SHORT (1-3 words max).
        - Connect new nodes to existing ones if relevant.
        - Create a new cluster if it's a new topic.
        - Return 5-7 high-quality nodes.
      `;

      const response = await genAI.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: graphSchema,
          systemInstruction: "You are Rabbit Hole. A playful, curious engine of knowledge. Use fun, simple language but deep concepts."
        }
      });

      const data = JSON.parse(response.text) as GraphState;
      
      let newNodes = data.nodes;
      let newLinks = data.links;

      if (graphData.nodes.length === 0) {
        const rootId = 'root-' + Date.now();
        const rootNode: NodeData = {
           id: rootId,
           label: query,
           type: NodeType.CORE,
           explanation: "The start of your adventure.",
           analogy: "The first step.",
           microQuest: { title: "Reflect", description: "What sparked this question?" },
           x: dimensions.width / 2,
           y: dimensions.height / 2,
           visited: true
        };
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

        Task: Dig deeper into this concept!
        
        Types to use (vary them!):
        ANALOGY, EXPERIMENT, HISTORY, APPLICATION, DEBATE, MISCONCEPTION, EXAMPLE.
        
        Rules:
        - Labels: 1-3 words.
        - 3-5 NEW child nodes.
        - Connect to "${node.id}".
        - Don't duplicate.
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

        Task: Coach the user!
        1. Score 0-100.
        2. Encouraging feedback.
        3. Recommend existing node IDs.
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
    <div className={`${isDarkMode ? 'dark' : ''} w-full h-full`}>
      <div className="relative w-full h-screen bg-cream-50 dark:bg-slate-900 text-rabbit-dark dark:text-cream-50 font-sans overflow-hidden selection:bg-rabbit-blue selection:text-white transition-colors duration-500">
        
        {/* Background Pattern */}
        <div className="absolute inset-0 z-0 opacity-40 dark:opacity-20 pointer-events-none" style={{ backgroundImage: 'radial-gradient(#cbd5e1 1px, transparent 1px)', backgroundSize: '24px 24px' }}></div>
        
        {/* Decorative Blob */}
        <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-purple-200/40 dark:bg-purple-900/20 rounded-full blur-[100px] animate-blob"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] bg-yellow-200/40 dark:bg-yellow-900/20 rounded-full blur-[100px] animate-blob animation-delay-2000"></div>

        {/* Main Canvas */}
        <div className={`absolute inset-0 z-0 transition-opacity duration-1000 ${isGraphEmpty ? 'opacity-0' : 'opacity-100'}`}>
          <GraphCanvas 
            data={graphData} 
            onNodeClick={handleNodeClick}
            width={dimensions.width}
            height={dimensions.height}
            activeTypes={activeLegendTypes}
            filterUnvisited={filterUnvisited}
            isDarkMode={isDarkMode}
          />
        </div>

        {/* Top Controls: Legend & Dark Mode */}
        <div className="absolute top-6 left-6 z-10 flex flex-col gap-4">
            
            {/* Filter Toggle */}
            {!isGraphEmpty && (
                <div>
                    <button 
                        onClick={() => setShowLegend(!showLegend)}
                        className="p-3 bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm border border-slate-200 dark:border-slate-700 rounded-2xl shadow-sm text-rabbit-slate dark:text-slate-300 hover:text-rabbit-blue transition flex items-center gap-2 font-display font-bold"
                    >
                        <FunnelIcon className="w-5 h-5" />
                        <span className="text-sm">Filter Map</span>
                    </button>
                    
                    {showLegend && (
                        <div className="mt-2 bg-white/90 dark:bg-slate-800/90 backdrop-blur-md border border-slate-200 dark:border-slate-700 p-4 rounded-3xl shadow-xl animate-fadeIn w-64">
                            
                            {/* Unvisited Filter Toggle */}
                            <button 
                                onClick={() => setFilterUnvisited(!filterUnvisited)}
                                className={`w-full flex items-center justify-between p-2.5 rounded-xl border mb-3 transition-all font-semibold ${filterUnvisited ? 'bg-rabbit-blue/10 border-rabbit-blue text-rabbit-blue' : 'bg-slate-50 dark:bg-slate-700 border-transparent text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-600'}`}
                            >
                                <div className="flex items-center gap-2">
                                    <EyeSlashIcon className="w-5 h-5" />
                                    <span className="text-sm">New Stuff Only</span>
                                </div>
                                {filterUnvisited && <CheckCircleIcon className="w-5 h-5" />}
                            </button>

                            <div className="space-y-1">
                            {Object.values(NodeType).filter(t => t !== NodeType.CORE).map(type => {
                                const isActive = activeLegendTypes.length === 0 || activeLegendTypes.includes(type);
                                return (
                                    <button 
                                        key={type} 
                                        onClick={() => toggleLegendType(type)}
                                        className={`w-full flex items-center gap-3 p-2 rounded-xl transition-all duration-200 ${isActive ? 'bg-slate-50 dark:bg-slate-700' : 'opacity-40 hover:opacity-70'}`}
                                    >
                                        <div 
                                            className="w-3 h-3 rounded-full shadow-sm" 
                                            style={{ backgroundColor: getNodeColor(type) }} 
                                        />
                                        <span className="text-xs font-bold text-slate-600 dark:text-slate-300 capitalize">
                                            {type.toLowerCase()}
                                        </span>
                                        {activeLegendTypes.includes(type) && (
                                            <CheckCircleIcon className="w-4 h-4 text-rabbit-blue ml-auto" />
                                        )}
                                    </button>
                                );
                            })}
                            </div>
                            {(activeLegendTypes.length > 0 || filterUnvisited) && (
                                <button 
                                    onClick={() => { setActiveLegendTypes([]); setFilterUnvisited(false); }}
                                    className="w-full mt-3 text-xs text-slate-400 hover:text-rabbit-blue py-2 border-t border-slate-100 dark:border-slate-700 font-semibold"
                                >
                                    Reset
                                </button>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>

        {/* Dark Mode Toggle (Top Right) */}
        <div className="absolute top-6 right-6 z-10">
            <button
                onClick={() => setIsDarkMode(!isDarkMode)}
                className="p-3 bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm border border-slate-200 dark:border-slate-700 rounded-full shadow-sm text-rabbit-slate dark:text-slate-300 hover:text-rabbit-blue transition"
            >
                {isDarkMode ? <SunIcon className="w-6 h-6" /> : <MoonIcon className="w-6 h-6" />}
            </button>
        </div>

        {/* Welcome / Empty State */}
        {isGraphEmpty && !loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center z-10 p-6">
            <div className="text-center max-w-3xl animate-fade-in-up">
              <h1 className="text-6xl md:text-8xl font-display font-black text-rabbit-dark dark:text-white mb-6 tracking-tight">
                Rabbit Hole
              </h1>
              <p className="text-rabbit-slate dark:text-slate-400 text-xl md:text-2xl mb-12 font-medium">
                where one question is never enough <br/>
                so fall into your curiosity
              </p>
              
              <div className="flex flex-col items-center gap-6">
                  <div className="flex flex-wrap justify-center gap-4">
                    {suggestedQuestions.map((q, i) => (
                      <button
                        key={q}
                        onClick={() => handleInitialQuery(undefined, q)}
                        className="px-6 py-3 rounded-full bg-white dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 hover:border-rabbit-blue dark:hover:border-rabbit-blue hover:text-rabbit-blue text-rabbit-slate dark:text-slate-200 text-base font-semibold transition-all duration-300 shadow-sm hover:shadow-md hover:-translate-y-1"
                        style={{ animationDelay: `${i * 100}ms` }}
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                  
                  <button 
                    onClick={refreshSuggestions}
                    className="flex items-center gap-2 text-rabbit-slate dark:text-slate-400 hover:text-rabbit-blue dark:hover:text-rabbit-blue transition-colors text-sm font-semibold"
                  >
                    <ArrowPathIcon className="w-4 h-4" />
                    <span>Shuffle ideas</span>
                  </button>
              </div>

            </div>
          </div>
        )}

        {/* Input Bar */}
        <div className={`absolute bottom-8 left-1/2 transform -translate-x-1/2 w-full max-w-2xl px-4 z-20 transition-all duration-500`}>
          <form onSubmit={(e) => handleInitialQuery(e)} className="relative group">
            <div className="relative flex items-center bg-white dark:bg-slate-800 rounded-full border-2 border-slate-100 dark:border-slate-700 shadow-xl focus-within:border-rabbit-blue focus-within:ring-4 focus-within:ring-rabbit-blue/10 transition-all p-2">
              <div className="pl-4 text-rabbit-blue">
                  {loading ? (
                      <div className="w-6 h-6 border-2 border-rabbit-blue border-t-transparent rounded-full animate-spin"></div>
                  ) : (
                      <SparklesIcon className="h-6 w-6" />
                  )}
              </div>
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask away..."
                className="w-full bg-transparent border-none focus:ring-0 text-rabbit-dark dark:text-white placeholder-slate-400 py-3 px-4 text-lg outline-none font-medium"
                disabled={loading}
              />
              <button 
                  type="submit"
                  disabled={!input.trim() || loading}
                  className="p-3 bg-rabbit-dark dark:bg-slate-700 rounded-full text-white hover:bg-rabbit-blue dark:hover:bg-rabbit-blue transition disabled:opacity-50 disabled:cursor-not-allowed shadow-md"
              >
                  <ArrowRightIcon className="w-5 h-5" />
              </button>
            </div>
          </form>
        </div>

        {/* Right Panel (Sheet) */}
        <div 
          className={`fixed right-4 top-4 bottom-4 w-full md:w-[450px] bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border border-white dark:border-slate-700 shadow-2xl rounded-3xl p-0 overflow-y-auto transform transition-transform duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] z-30 ${selectedNode ? 'translate-x-0' : 'translate-x-[110%]'}`}
        >
           {selectedNode && (
             <div className="min-h-full flex flex-col">
               {/* Header */}
               <div className="sticky top-0 z-20 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md px-8 py-6 flex items-start justify-between border-b border-slate-50 dark:border-slate-800">
                  <div>
                      <span 
                          className="inline-block px-3 py-1 rounded-full text-[10px] font-black tracking-widest uppercase mb-3" 
                          style={{ 
                              backgroundColor: getNodeColor(selectedNode.type) + '22', 
                              color: getNodeColor(selectedNode.type) 
                          }}
                      >
                          {selectedNode.type}
                      </span>
                      <h2 className="text-3xl font-display font-black text-rabbit-dark dark:text-white leading-tight">{selectedNode.label}</h2>
                  </div>
                  <button 
                      onClick={() => setSelectedNode(null)} 
                      className="p-2 -mr-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition text-slate-400 hover:text-rabbit-dark dark:hover:text-white"
                  >
                      <XMarkIcon className="w-6 h-6" />
                  </button>
               </div>
               
               <div className="p-8 space-y-8 flex-grow">
                  {/* Explanation */}
                  <p className="text-lg text-rabbit-slate dark:text-slate-300 leading-relaxed font-medium">{selectedNode.explanation}</p>

                  {/* Cards */}
                  <div className="grid gap-4">
                      {/* Analogy */}
                      <div className="relative p-6 bg-orange-50 dark:bg-orange-900/10 rounded-2xl border-2 border-orange-100 dark:border-orange-500/20">
                          <div className="absolute top-4 right-4 text-orange-300 dark:text-orange-500/50">
                              <LightBulbIcon className="w-6 h-6" />
                          </div>
                          <h3 className="text-xs font-bold text-orange-500 uppercase tracking-widest mb-2">Think of it like...</h3>
                          {/* UPDATED: Removed bold, added italic and relaxed font weight */}
                          <p className="text-rabbit-dark dark:text-orange-100 font-sans font-medium text-lg leading-relaxed italic">"{selectedNode.analogy}"</p>
                      </div>

                      {/* Quest */}
                      <div className="relative p-6 bg-green-50 dark:bg-green-900/10 rounded-2xl border-2 border-green-100 dark:border-green-500/20">
                           <div className="absolute top-4 right-4 text-green-300 dark:text-green-500/50">
                              <BeakerIcon className="w-6 h-6" />
                          </div>
                          <h3 className="text-xs font-bold text-green-600 dark:text-green-400 uppercase tracking-widest mb-2">Try This: {selectedNode.microQuest.title}</h3>
                          <p className="text-rabbit-dark dark:text-green-100 text-sm font-medium leading-relaxed">{selectedNode.microQuest.description}</p>
                      </div>
                  </div>

                  {/* Explore Button */}
                  <button 
                      onClick={() => expandNode(selectedNode)}
                      disabled={loading}
                      className="w-full py-4 px-6 rounded-2xl bg-rabbit-dark dark:bg-white text-white dark:text-rabbit-dark font-display font-bold shadow-lg shadow-rabbit-dark/20 dark:shadow-white/10 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2 hover:bg-rabbit-blue dark:hover:bg-rabbit-blue disabled:opacity-70 disabled:cursor-not-allowed"
                  >
                       {loading ? (
                           <>
                              <div className="w-4 h-4 border-2 border-white dark:border-rabbit-dark border-t-transparent rounded-full animate-spin"></div>
                              <span>Digging deeper...</span>
                           </>
                      ) : (
                          <>
                              <MagnifyingGlassIcon className="w-5 h-5 stroke-2" />
                              <span>Explore this branch</span>
                          </>
                      )}
                  </button>

                  {/* Quiz Section */}
                  <div className="border-t-2 border-dashed border-slate-100 dark:border-slate-800 pt-8">
                      <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                          <ChatBubbleBottomCenterTextIcon className="w-5 h-5" />
                          Do you get it?
                      </h3>
                      <div className="relative">
                          <textarea 
                              value={testInput}
                              onChange={(e) => setTestInput(e.target.value)}
                              placeholder={`In your own words, what is ${selectedNode.label}?`}
                              className="w-full bg-slate-50 dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-2xl p-4 text-rabbit-dark dark:text-white placeholder-slate-400 focus:border-rabbit-blue focus:ring-0 transition min-h-[100px] text-sm resize-none font-medium"
                          />
                          <button 
                              onClick={handleTestUnderstanding}
                              disabled={feedbackLoading || !testInput.trim()}
                              className="absolute bottom-3 right-3 px-4 py-2 bg-white dark:bg-slate-700 text-rabbit-dark dark:text-white shadow-sm border border-slate-200 dark:border-slate-600 hover:border-rabbit-blue text-xs rounded-xl font-bold transition disabled:opacity-0"
                          >
                              {feedbackLoading ? 'Checking...' : 'Check Me'}
                          </button>
                      </div>

                      {feedback && (
                          <div className={`mt-4 p-5 rounded-2xl border-2 ${feedback.score > 70 ? 'bg-green-50 dark:bg-green-900/20 border-green-100 dark:border-green-500/20' : 'bg-orange-50 dark:bg-orange-900/20 border-orange-100 dark:border-orange-500/20'} animate-fade-in-up`}>
                              <div className="flex items-center justify-between mb-2">
                                  <span className={`flex items-center text-sm font-bold ${feedback.score > 70 ? 'text-green-600 dark:text-green-400' : 'text-orange-600 dark:text-orange-400'}`}>
                                      {feedback.score > 70 ? <CheckCircleIcon className="w-5 h-5 mr-2"/> : <ExclamationCircleIcon className="w-5 h-5 mr-2"/>}
                                      Score: {feedback.score}%
                                  </span>
                              </div>
                              <p className="text-rabbit-dark dark:text-white text-sm mb-4 font-medium">{feedback.feedback}</p>
                              
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
                                                  className="px-3 py-1 bg-white dark:bg-slate-700 hover:bg-slate-50 dark:hover:bg-slate-600 border border-slate-200 dark:border-slate-600 rounded-lg text-xs text-rabbit-slate dark:text-slate-200 font-semibold transition"
                                              >
                                                  Look at: {n.label}
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
    </div>
  );
};

export default App;