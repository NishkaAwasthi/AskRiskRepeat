import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import { GraphState, NodeData, NodeType, LinkData } from './types';

interface GraphCanvasProps {
  data: GraphState;
  onNodeClick: (node: NodeData) => void;
  width: number;
  height: number;
  activeTypes: NodeType[]; // Types currently selected in Legend (if empty, show all)
  filterUnvisited: boolean; // Only show unvisited nodes
  isDarkMode: boolean;
}

// Playful Palette
export const getNodeColor = (type: NodeType) => {
  switch (type) {
    case NodeType.CORE: return '#fbbf24';         // Amber-400 (Sunny)
    case NodeType.ANALOGY: return '#fb923c';      // Orange-400 (Warm)
    case NodeType.EXPERIMENT: return '#4ade80';   // Green-400 (Minty)
    case NodeType.HISTORY: return '#a78bfa';      // Violet-400 (Soft Purple)
    case NodeType.APPLICATION: return '#60a5fa';  // Blue-400 (Sky)
    case NodeType.DEBATE: return '#e879f9';       // Fuchsia-400 (Vibrant Pink/Purple)
    case NodeType.MISCONCEPTION: return '#dc2626';// Red-600 (Deep, Strong Red)
    case NodeType.EXAMPLE: return '#22d3ee';      // Cyan-400 (Aqua)
    default: return '#94a3b8';                    // Slate-400
  }
};

const GraphCanvas: React.FC<GraphCanvasProps> = ({ data, onNodeClick, width, height, activeTypes, filterUnvisited, isDarkMode }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const simulationRef = useRef<d3.Simulation<NodeData, LinkData> | null>(null);
  
  const nodesRef = useRef<NodeData[]>([]);
  const linksRef = useRef<LinkData[]>([]);

  useEffect(() => {
    if (!svgRef.current) return;

    // Initialize D3 Simulation
    const simulation = d3.forceSimulation<NodeData, LinkData>()
      .force("link", d3.forceLink<NodeData, LinkData>().id(d => d.id).distance(130))
      .force("charge", d3.forceManyBody().strength(-400))
      .force("center", d3.forceCenter(width / 2, height / 2).strength(0.05))
      .force("collide", d3.forceCollide().radius(45).iterations(2));

    simulationRef.current = simulation;

    const svg = d3.select(svgRef.current);
    
    // Add definitions for filters
    const defs = svg.append("defs");
    
    // Soft Drop Shadow
    const filter = defs.append("filter")
      .attr("id", "soft-shadow")
      .attr("x", "-50%")
      .attr("y", "-50%")
      .attr("width", "200%")
      .attr("height", "200%");
    
    filter.append("feGaussianBlur")
      .attr("in", "SourceAlpha")
      .attr("stdDeviation", 3)
      .attr("result", "blur");
    
    filter.append("feOffset")
      .attr("in", "blur")
      .attr("dx", 2)
      .attr("dy", 3)
      .attr("result", "offsetBlur");

    // Lighten shadow
    const feComponentTransfer = filter.append("feComponentTransfer");
    feComponentTransfer.append("feFuncA")
        .attr("type", "linear")
        .attr("slope", "0.2"); // Opacity of shadow
    
    const feMerge = filter.append("feMerge");
    feMerge.append("feMergeNode").attr("in", "offsetBlur");
    feMerge.append("feMergeNode").attr("in", "SourceGraphic");

    // Container Group for Zoom
    const g = svg.append("g");

    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 4])
      .on("zoom", (event) => {
        g.attr("transform", event.transform);
      });

    svg.call(zoom);

    return () => {
      simulation.stop();
      svg.selectAll("*").remove();
    };
  }, []);

  // Update visual styles based on Dark Mode
  useEffect(() => {
    if (!svgRef.current) return;
    const svg = d3.select(svgRef.current);
    const g = svg.select("g");
    
    const textColor = isDarkMode ? '#f1f5f9' : '#334155';
    const textShadow = isDarkMode ? '0px 1px 3px rgba(0,0,0,0.9)' : '0px 1px 2px rgba(255,255,255,0.8)';
    const linkColor = isDarkMode ? '#475569' : '#cbd5e1';
    const nodeStroke = isDarkMode ? '#1e293b' : '#ffffff';
    const nodeStrokeVisited = isDarkMode ? '#334155' : '#f1f5f9';

    // Update Links
    g.selectAll<SVGLineElement, LinkData>(".link")
        .transition().duration(500)
        .attr("stroke", linkColor);

    // Update Text
    g.selectAll<SVGTextElement, NodeData>("text")
        .transition().duration(500)
        .attr("fill", textColor)
        .style("text-shadow", textShadow);

    // Update Nodes (Circle Borders)
    g.selectAll<SVGGElement, NodeData>(".node").each(function(d) {
        d3.select(this).select("circle:nth-child(2)") // The main circle
            .transition().duration(500)
            .attr("stroke", d.visited ? nodeStrokeVisited : nodeStroke);
    });

  }, [isDarkMode]);

  // Update simulation data
  useEffect(() => {
    if (!simulationRef.current || !svgRef.current) return;

    const svg = d3.select(svgRef.current);
    const g = svg.select("g");

    // Merge logic
    const oldNodes = new Map(nodesRef.current.map(n => [n.id, n]));
    const oldLinks = new Map(linksRef.current.map(l => [(l.source as NodeData).id + "-" + (l.target as NodeData).id, l]));

    const newNodes = data.nodes.map(n => {
      const existing = oldNodes.get(n.id);
      if (existing) {
        return Object.assign(existing, { visited: n.visited });
      }
      return { ...n, x: width/2 + (Math.random() - 0.5) * 50, y: height/2 + (Math.random() - 0.5) * 50 }; 
    });

    const newLinks = data.links.map(l => {
        const sourceId = typeof l.source === 'object' ? (l.source as NodeData).id : l.source;
        const targetId = typeof l.target === 'object' ? (l.target as NodeData).id : l.target;
        const key = sourceId + "-" + targetId;
        const existing = oldLinks.get(key);
        return existing ? existing : { ...l };
    });

    nodesRef.current = newNodes;
    linksRef.current = newLinks;

    const simulation = simulationRef.current;
    
    simulation.nodes(newNodes);
    (simulation.force("link") as d3.ForceLink<NodeData, LinkData>).links(newLinks);
    simulation.alpha(1).restart();

    // --- Rendering ---
    
    // Style variables for initial render
    const textColor = isDarkMode ? '#f1f5f9' : '#334155';
    const textShadow = isDarkMode ? '0px 1px 3px rgba(0,0,0,0.9)' : '0px 1px 2px rgba(255,255,255,0.8)';
    const linkColor = isDarkMode ? '#475569' : '#cbd5e1';
    const nodeStroke = isDarkMode ? '#1e293b' : '#ffffff';
    const nodeStrokeVisited = isDarkMode ? '#334155' : '#f1f5f9';

    // Links
    const link = g.selectAll<SVGLineElement, LinkData>(".link")
      .data(newLinks, d => {
        const sourceId = typeof d.source === 'object' ? (d.source as NodeData).id : d.source;
        const targetId = typeof d.target === 'object' ? (d.target as NodeData).id : d.target;
        return `${sourceId}-${targetId}`;
      });

    link.exit().transition().duration(300).attr("opacity", 0).remove();

    const linkEnter = link.enter().append("line")
      .attr("class", "link")
      .attr("stroke", linkColor) // Dynamic
      .attr("stroke-width", 2)
      .attr("opacity", 0.6)
      .attr("stroke-linecap", "round");

    const linkMerge = linkEnter.merge(link);

    // Nodes
    const node = g.selectAll<SVGGElement, NodeData>(".node")
      .data(newNodes, d => d.id);

    node.exit().transition().duration(500).attr("opacity", 0).attr("transform", "scale(0)").remove();

    const nodeEnter = node.enter().append("g")
      .attr("class", "node")
      .attr("cursor", "pointer")
      .call(d3.drag<SVGGElement, NodeData>()
        .on("start", dragstarted)
        .on("drag", dragged)
        .on("end", dragended)
      )
      .on("click", (event, d) => {
        event.stopPropagation();
        onNodeClick(d);
      })
      .on("mouseenter", function(event, d) {
        // Bring to front
        d3.select(this).raise();

        // 1. Pop Effect on Main Circle
        d3.select(this).select("circle:nth-child(2)")
          .transition("hover-main")
          .duration(300)
          .ease(d3.easeBackOut)
          .attr("r", d.type === NodeType.CORE ? 32 : 20); // Scale up ~1.3x

        // 2. Expand and Brighten Halo
        d3.select(this).select(".halo")
          .transition("hover-halo")
          .duration(300)
          .ease(d3.easeCubicOut)
          .attr("r", d.type === NodeType.CORE ? 60 : 45)
          .attr("opacity", 0.4);

        // 3. Emphasize Text
        d3.select(this).select("text")
          .transition("hover-text")
          .duration(300)
          .attr("y", d.type === NodeType.CORE ? 55 : 42) // Shift down slightly
          .style("font-weight", "800");
      })
      .on("mouseleave", function(event, d) {
        // 1. Reset Main Circle
        d3.select(this).select("circle:nth-child(2)")
          .transition("hover-main")
          .duration(300)
          .ease(d3.easeCubicOut)
          .attr("r", d.type === NodeType.CORE ? 25 : 15);

        // 2. Reset Halo
        d3.select(this).select(".halo")
          .transition("hover-halo")
          .duration(300)
          .ease(d3.easeCubicOut)
          .attr("r", d.type === NodeType.CORE ? 42 : 28)
          .attr("opacity", 0.2);

        // 3. Reset Text
        d3.select(this).select("text")
          .transition("hover-text")
          .duration(300)
          .attr("y", d.type === NodeType.CORE ? 45 : 32)
          .style("font-weight", "600");
      });

    // Node Visuals
    
    // 1. Halo (Hover/Select effect)
    nodeEnter.append("circle")
      .attr("r", 0) 
      .attr("fill", d => getNodeColor(d.type))
      .attr("opacity", 0.2)
      .attr("class", "halo")
      .transition().duration(600).ease(d3.easeElasticOut)
      .attr("r", d => d.type === NodeType.CORE ? 42 : 28);

    // 2. Main Circle (White border, colored fill)
    nodeEnter.append("circle")
      .attr("r", 0)
      .attr("fill", d => getNodeColor(d.type)) // Fill with color
      .attr("stroke", nodeStroke) // Dynamic
      .attr("stroke-width", 3)
      .style("filter", "url(#soft-shadow)")
      .transition().duration(500).ease(d3.easeBackOut)
      .attr("r", d => d.type === NodeType.CORE ? 25 : 15);

    // Labels
    const label = nodeEnter.append("text")
      .text(d => d.label)
      .attr("x", 0)
      .attr("y", d => d.type === NodeType.CORE ? 45 : 32)
      .attr("text-anchor", "middle")
      .attr("fill", textColor) // Dynamic
      .attr("font-size", "0px")
      .attr("font-family", "Outfit")
      .attr("font-weight", "600")
      .attr("pointer-events", "none")
      .style("opacity", 1)
      .style("text-shadow", textShadow); // Dynamic
    
    label.transition().delay(100).duration(500)
      .attr("font-size", d => d.type === NodeType.CORE ? "16px" : "12px");

    const nodeMerge = nodeEnter.merge(node);

    // Update Visited State
    nodeMerge.select("circle:nth-child(2)") // Main circle
        .transition().duration(300)
        .attr("stroke", d => d.visited ? nodeStrokeVisited : nodeStroke)
        .attr("stroke-width", d => d.visited ? 4 : 3);

    simulation.on("tick", () => {
      linkMerge
        .attr("x1", d => (d.source as NodeData).x!)
        .attr("y1", d => (d.source as NodeData).y!)
        .attr("x2", d => (d.target as NodeData).x!)
        .attr("y2", d => (d.target as NodeData).y!);

      nodeMerge
        .attr("transform", d => `translate(${d.x},${d.y})`);
    });

    function dragstarted(event: any, d: NodeData) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      d.fx = d.x;
      d.fy = d.y;
    }

    function dragged(event: any, d: NodeData) {
      d.fx = event.x;
      d.fy = event.y;
    }

    function dragended(event: any, d: NodeData) {
      if (!event.active) simulation.alphaTarget(0);
      d.fx = null;
      d.fy = null;
    }

  }, [data, width, height]); // Note: isDarkMode is handled in the other useEffect for style updates

  // Filtering Logic
  useEffect(() => {
    if (!svgRef.current) return;
    const svg = d3.select(svgRef.current);
    
    const isTypeFiltering = activeTypes.length > 0;
    const isVisitedFiltering = filterUnvisited;
    const isFiltering = isTypeFiltering || isVisitedFiltering;
    
    svg.selectAll<SVGGElement, NodeData>(".node")
        .transition().duration(400)
        .style("opacity", d => {
            if (!isFiltering) return 1;
            const typeMatch = !isTypeFiltering || activeTypes.includes(d.type);
            const visitedMatch = !isVisitedFiltering || !d.visited;
            return (typeMatch && visitedMatch) ? 1 : 0.1;
        })
        .style("pointer-events", d => {
             if (!isFiltering) return "all";
             const typeMatch = !isTypeFiltering || activeTypes.includes(d.type);
             const visitedMatch = !isVisitedFiltering || !d.visited;
             return (typeMatch && visitedMatch) ? "all" : "none";
        });

    svg.selectAll<SVGLineElement, LinkData>(".link")
        .transition().duration(400)
        .attr("opacity", d => {
            if (!isFiltering) return 0.6;
            const s = (d.source as NodeData);
            const t = (d.target as NodeData);
            
            const sActive = (!isTypeFiltering || activeTypes.includes(s.type)) && (!isVisitedFiltering || !s.visited);
            const tActive = (!isTypeFiltering || activeTypes.includes(t.type)) && (!isVisitedFiltering || !t.visited);
            
            if (!sActive || !tActive) return 0.1;
            return 0.6;
        });

  }, [activeTypes, filterUnvisited, data]);

  return (
    <svg 
      ref={svgRef} 
      width={width} 
      height={height} 
      className="w-full h-full cursor-grab active:cursor-grabbing"
      onClick={() => { /* Optional: Deselect logic */ }}
    />
  );
};

export default GraphCanvas;