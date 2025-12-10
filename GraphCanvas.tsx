
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
}

// Color mapping exported for Legend in App.tsx
export const getNodeColor = (type: NodeType) => {
  switch (type) {
    case NodeType.CORE: return '#ffffff';         // White (Center)
    case NodeType.ANALOGY: return '#f59e0b';      // Amber-500
    case NodeType.EXPERIMENT: return '#10b981';   // Emerald-500
    case NodeType.HISTORY: return '#8b5cf6';      // Violet-500 (Distinct from Red)
    case NodeType.APPLICATION: return '#3b82f6';  // Blue-500
    case NodeType.DEBATE: return '#d946ef';       // Fuchsia-500 (Distinct from Violet)
    case NodeType.MISCONCEPTION: return '#ef4444';// Red-500
    case NodeType.EXAMPLE: return '#06b6d4';      // Cyan-500
    default: return '#64748b';                    // Slate-500
  }
};

const GraphCanvas: React.FC<GraphCanvasProps> = ({ data, onNodeClick, width, height, activeTypes, filterUnvisited }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const simulationRef = useRef<d3.Simulation<NodeData, LinkData> | null>(null);
  
  const nodesRef = useRef<NodeData[]>([]);
  const linksRef = useRef<LinkData[]>([]);

  useEffect(() => {
    if (!svgRef.current) return;

    // Initialize D3 Simulation
    const simulation = d3.forceSimulation<NodeData, LinkData>()
      .force("link", d3.forceLink<NodeData, LinkData>().id(d => d.id).distance(140)) // Increased distance
      .force("charge", d3.forceManyBody().strength(-500)) // Stronger repulsion
      .force("center", d3.forceCenter(width / 2, height / 2).strength(0.08))
      .force("collide", d3.forceCollide().radius(50).iterations(2));

    simulationRef.current = simulation;

    const svg = d3.select(svgRef.current);
    
    // Add definitions for filters
    const defs = svg.append("defs");
    
    // Drop Shadow Filter
    const filter = defs.append("filter")
      .attr("id", "drop-shadow")
      .attr("height", "130%");
    
    filter.append("feGaussianBlur")
      .attr("in", "SourceAlpha")
      .attr("stdDeviation", 3)
      .attr("result", "blur");
    
    filter.append("feOffset")
      .attr("in", "blur")
      .attr("dx", 2)
      .attr("dy", 2)
      .attr("result", "offsetBlur");
    
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
      .attr("stroke", "#475569")
      .attr("stroke-width", 1.5)
      .attr("opacity", 0.3)
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
      });

    // Node Visuals
    // 1. Glow Halo (fades in)
    nodeEnter.append("circle")
      .attr("r", 0) // animate from 0
      .attr("fill", d => getNodeColor(d.type))
      .attr("opacity", 0.15)
      .attr("class", "halo")
      .transition().duration(700).ease(d3.easeBackOut)
      .attr("r", d => d.type === NodeType.CORE ? 45 : 30);

    // 2. Main Circle
    nodeEnter.append("circle")
      .attr("r", 0)
      .attr("fill", "#0f172a") // Dark background for contrast
      .attr("stroke", d => getNodeColor(d.type))
      .attr("stroke-width", 3)
      .style("filter", "url(#drop-shadow)")
      .transition().duration(500).ease(d3.easeBackOut)
      .attr("r", d => d.type === NodeType.CORE ? 22 : 14);

    // 3. Inner Dot (Active State)
    nodeEnter.append("circle")
      .attr("r", d => d.type === NodeType.CORE ? 8 : 4)
      .attr("fill", d => getNodeColor(d.type))
      .attr("opacity", 0.8)
      .attr("pointer-events", "none");

    // Labels
    const label = nodeEnter.append("text")
      .text(d => d.label)
      .attr("x", 0)
      .attr("y", d => d.type === NodeType.CORE ? 40 : 28)
      .attr("text-anchor", "middle")
      .attr("fill", "#e2e8f0")
      .attr("font-size", "0px") // Animate in
      .attr("font-family", "Space Grotesk")
      .attr("font-weight", "500")
      .attr("pointer-events", "none")
      .style("text-shadow", "0px 2px 4px rgba(0,0,0,0.8)")
      .style("opacity", 0.9);
    
    label.transition().delay(100).duration(500)
      .attr("font-size", d => d.type === NodeType.CORE ? "14px" : "11px");

    const nodeMerge = nodeEnter.merge(node);

    // Update Visited State (Thick white border or glow change)
    nodeMerge.select("circle:nth-child(2)") // Select main circle
        .transition().duration(300)
        .attr("stroke-width", d => d.visited ? 4 : 2)
        .attr("stroke", d => d.visited ? "#f8fafc" : getNodeColor(d.type)); // White border if visited

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

  }, [data, width, height]);

  // Separate Effect for Handling Selection/Filtering Visuals (Performance)
  useEffect(() => {
    if (!svgRef.current) return;
    const svg = d3.select(svgRef.current);
    
    // Check if Filtering is active
    const isTypeFiltering = activeTypes.length > 0;
    const isVisitedFiltering = filterUnvisited;
    const isFiltering = isTypeFiltering || isVisitedFiltering;
    
    // Update Node Opacity
    svg.selectAll<SVGGElement, NodeData>(".node")
        .transition().duration(400)
        .style("opacity", d => {
            if (!isFiltering) return 1;
            
            const typeMatch = !isTypeFiltering || activeTypes.includes(d.type);
            const visitedMatch = !isVisitedFiltering || !d.visited; // If unvisited filter is on, node must NOT be visited

            return (typeMatch && visitedMatch) ? 1 : 0.1;
        })
        .style("pointer-events", d => {
             if (!isFiltering) return "all";
             const typeMatch = !isTypeFiltering || activeTypes.includes(d.type);
             const visitedMatch = !isVisitedFiltering || !d.visited;
             return (typeMatch && visitedMatch) ? "all" : "none";
        });

    // Update Link Opacity
    svg.selectAll<SVGLineElement, LinkData>(".link")
        .transition().duration(400)
        .attr("opacity", d => {
            if (!isFiltering) return 0.3;
            // Check if both source and target are active.
            // Note: d.source/target are NodeData references after simulation init
            const s = (d.source as NodeData);
            const t = (d.target as NodeData);
            
            // Check source
            const sTypeMatch = !isTypeFiltering || activeTypes.includes(s.type);
            const sVisitedMatch = !isVisitedFiltering || !s.visited;
            const sActive = sTypeMatch && sVisitedMatch;

            // Check target
            const tTypeMatch = !isTypeFiltering || activeTypes.includes(t.type);
            const tVisitedMatch = !isVisitedFiltering || !t.visited;
            const tActive = tTypeMatch && tVisitedMatch;
            
            // If either end is dimmed, dim the link significantly
            if (!sActive || !tActive) return 0.05;
            
            return 0.3;
        });

  }, [activeTypes, filterUnvisited, data]); // Re-run when selection changes or data updates

  return (
    <svg 
      ref={svgRef} 
      width={width} 
      height={height} 
      className="w-full h-full bg-space-950 cursor-grab active:cursor-grabbing"
      onClick={() => { /* Optional: Deselect logic */ }}
    />
  );
};

export default GraphCanvas;
