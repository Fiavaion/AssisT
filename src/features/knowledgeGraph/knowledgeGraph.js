/**
 * Knowledge Graph Feature
 *
 * Visualizes relationships between concepts in educational content.
 * Uses AI to extract entities and relationships, then renders an
 * interactive graph visualization using D3.js.
 *
 * Features:
 * - Entity extraction (concepts, terms, people, dates)
 * - Relationship mapping between concepts
 * - Interactive graph visualization with mouse-centered zoom/pan
 * - Clickable nodes for definitions
 * - Export to PNG
 * - D3.js force-directed layout with collision detection
 *
 * @module features/knowledgeGraph
 */

import { showToast } from '../../core/ui/toast.js';
import { Z } from '../../utils/z-index.js';
import { sanitizeHTML } from '../../utils/sanitize.js';
import { attachInteractiveHandler } from '../../utils/event-handlers.js';
import { injectAIBadgeStyles } from '../../utils/ai-badge.js';
import {
  getAIMode,
  checkAIAvailable,
  generateWithAI,
  getUnavailableStatusMessage,
  getSuccessStatusMessage,
  setAIStatusBar,
} from '../shared/ai-feature-client.js';
import * as d3Force from 'd3-force';
import * as d3Selection from 'd3-selection';
import * as d3Zoom from 'd3-zoom';
import * as d3Drag from 'd3-drag';

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

let graph_panel = null;
let graph_data = null;
let graph_svg = null;
let graph_container = null;
let graph_simulation = null;
let graph_zoomBehavior = null;
let graph_tooltip = null; // Separate tooltip element (outside panel to avoid transform containment)

const graph_settings = {
  enabled: true,
  autoExtract: true,
  showDefinitions: true,
  layout: 'force',
  nodeSize: 30,
  linkStrength: 0.5,
};

// Node types with colors
const NODE_TYPES = {
  concept: { color: '#4CAF50', icon: '💡' },
  term: { color: '#2196F3', icon: '📖' },
  person: { color: '#FF9800', icon: '👤' },
  date: { color: '#9C27B0', icon: '📅' },
  place: { color: '#00BCD4', icon: '📍' },
  event: { color: '#F44336', icon: '⚡' },
  theory: { color: '#673AB7', icon: '🔬' },
  unknown: { color: '#607D8B', icon: '❓' },
};

// Relationship types
const RELATION_TYPES = {
  related_to: { color: '#9E9E9E', dash: '' },
  causes: { color: '#F44336', dash: '' },
  part_of: { color: '#4CAF50', dash: '5,5' },
  example_of: { color: '#2196F3', dash: '10,5' },
  opposite_of: { color: '#FF5722', dash: '2,2' },
  leads_to: { color: '#FF9800', dash: '' },
  defined_by: { color: '#9C27B0', dash: '5,10' },
};

// ============================================================================
// LLM INTEGRATION
// ============================================================================

// System prompt for cloud models — constrains Claude to output-only JSON
const GRAPH_CLOUD_SYSTEM_PROMPT = `You are a knowledge graph extractor for educational content. Your sole task is to return a raw JSON object. STRICT OUTPUT RULES: Start your response with { and end with }. Never write any preamble, explanation, label, or markdown. Never write phrases like "Here is the knowledge graph:" or wrap the JSON in code blocks.`;

/**
 * Build the extraction prompt. Local models get a shorter, more directive prompt
 * with a compact JSON template at the end — small models follow recent examples best.
 */
function graph_buildPrompt(text, modeInfo) {
  if (modeInfo.isLocal) {
    return `Extract a knowledge graph from this educational text. Return ONLY a JSON object — no explanation, no markdown.

TEXT: "${text.substring(0, 1000)}"

STRICT RULES:
- 6-8 nodes only. NO generic or stop words as nodes (never use: since, after, positive, negative, general, key, main, various, through, within, first, last, more, less, also, often, always, new, old)
- node "type" MUST be exactly one of: person, place, date, event, theory, term, concept
  person = a named human (e.g. Darwin, Marie Curie)
  place = a real location or ecosystem (e.g. Arctic Ocean, Amazon, Earth's atmosphere)
  event = a historical event (e.g. Industrial Revolution, Ice Age, Paris Agreement)
  term = a precise scientific/technical word (e.g. permafrost, albedo, photosynthesis, osmosis)
  concept = an abstract idea (e.g. feedback loop, resilience, biodiversity, climate forcing)
- edge "type" MUST be exactly one of: causes, part_of, leads_to, example_of, related_to
  Use causes/leads_to/part_of/example_of whenever possible. Only use related_to as last resort.
- Every edge source and target must match an existing node id exactly

OUTPUT THIS EXACT JSON STRUCTURE:
{"nodes":[{"id":"snake_case_id","label":"Display Name","type":"term","definition":"One accurate sentence."}],"edges":[{"source":"id1","target":"id2","type":"causes","label":"causes"}]}

JSON:`;
  }

  return `Extract a knowledge graph from the educational text below. The text may span multiple academic disciplines — extract the most meaningful concepts and the real relationships between them, not just word co-occurrence.

NODE TYPES (use exactly these string values):
- "person"  → Any named human: scientists, researchers, historical figures
- "place"   → Locations, regions, ecosystems (e.g. Arctic Ocean, Amazon Basin)
- "date"    → Time periods, years, eras (e.g. "pre-industrial era", "20th century")
- "event"   → Specific historical or scientific events (e.g. "Industrial Revolution", "Paris Agreement")
- "theory"  → Named theories, models, frameworks (e.g. "systems theory", "plate tectonics")
- "term"    → Precise scientific/technical vocabulary (e.g. "albedo", "trophic cascade", "permafrost")
- "concept" → Broader abstract ideas (e.g. "feedback loop", "resilience", "interdependence")

EDGE TYPES: related_to | causes | part_of | example_of | opposite_of | leads_to | defined_by
- causes: A directly produces B (deforestation → biodiversity loss)
- part_of: A is a component/subdomain of B (oceanography part_of climate science)
- leads_to: A sequentially results in B (warming → sea level rise)
- example_of: A is a specific instance of B (El Niño example_of climate oscillation)
- related_to: ONLY when no more specific type fits

NODE QUALITY RULES:
- Extract 6–14 nodes — prefer fewer meaningful nodes over many generic ones
- Node ids: unique, lowercase, underscores only (e.g. "atmospheric_physics", "feedback_loop")
- NO generic words as nodes (avoid: text, study, approach, system, data, model, factor, process)
- Definitions must be domain-accurate — NEVER write "A concept mentioned in the text"
- 1 informative sentence per definition
- Every edge source/target must exactly match an existing node id

REQUIRED JSON STRUCTURE:
{
  "nodes": [{"id": "unique_id", "label": "Name or Term", "type": "person|place|date|event|theory|term|concept", "definition": "1 sentence definition"}],
  "edges": [{"source": "node_id_1", "target": "node_id_2", "type": "causes|part_of|leads_to|example_of|related_to", "label": "short label"}]
}

TEXT TO ANALYZE:
${text.substring(0, 3000)}`;
}

/**
 * Extract entities and relationships from text using AI
 * @param {string} text - Text to analyze
 * @param {import('../shared/ai-feature-client.js').AIMode} modeInfo - AI mode from getAIMode()
 * @returns {Promise<Object>} Graph data with nodes and edges
 */
async function graph_extractFromText(text, modeInfo) {
  const prompt = graph_buildPrompt(text, modeInfo);

  const maxTokens = modeInfo.isLocal ? 900 : 2000;

  try {
    console.log(`[KnowledgeGraph] Calling AI for extraction (${modeInfo.displayLabel})...`);

    // Pass system prompt for cloud, format:'json' for local
    const aiResult = await generateWithAI(
      prompt,
      modeInfo,
      modeInfo.isCloud
        ? {
            system: GRAPH_CLOUD_SYSTEM_PROMPT,
            maxTokens,
            temperature: 0.3,
            feature: 'knowledgeGraph',
            noCache: true,
          }
        : { maxTokens, temperature: 0.3, feature: 'knowledgeGraph', timeout: 55000, num_ctx: 2048 }
    );

    console.log('[KnowledgeGraph] AI response received');

    if (aiResult && aiResult.text) {
      // Service-worker pre-parses JSON when format:'json' is used — handle object directly
      if (typeof aiResult.text === 'object' && aiResult.text !== null) {
        if (aiResult.text.parseError) {
          console.error(
            '[KnowledgeGraph] Service-worker JSON parse failed, raw:',
            aiResult.text.raw?.substring(0, 200)
          );
          throw new Error('Service-worker could not parse AI JSON response');
        }
        console.log('[KnowledgeGraph] Received pre-parsed JSON object from service-worker');
        return graph_validateAndEnhance(aiResult.text);
      }

      let jsonStr = aiResult.text;
      console.log('[KnowledgeGraph] Raw AI data:', jsonStr);

      // Extract from code block — accept unclosed blocks (truncated responses)
      const closedBlock = jsonStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      const openBlock = jsonStr.match(/```(?:json)?\s*([\s\S]*)/);
      if (closedBlock) {
        jsonStr = closedBlock[1];
      } else if (openBlock) {
        jsonStr = openBlock[1]; // truncated before closing ```
        console.log('[KnowledgeGraph] Extracted from unclosed code block (truncated)');
      }

      jsonStr = jsonStr.trim();

      // Find the opening brace — everything from there is our JSON candidate
      const braceStart = jsonStr.indexOf('{');
      if (braceStart === -1) {
        console.warn('[KnowledgeGraph] No JSON object found in response');
      } else {
        const candidate = jsonStr.substring(braceStart);
        try {
          const data = JSON.parse(candidate);
          console.log('[KnowledgeGraph] Parsed JSON successfully:', data);
          return graph_validateAndEnhance(data);
        } catch (parseErr) {
          console.warn('[KnowledgeGraph] JSON truncated, attempting repair...');
          // Find last complete node/edge entry (ends with `},` or `}` then newline/end)
          const lastComplete = Math.max(candidate.lastIndexOf('},'), candidate.lastIndexOf('}\n'));
          if (lastComplete > 0) {
            const inEdges = candidate.lastIndexOf('"edges"') > candidate.lastIndexOf('"nodes"');
            const repaired =
              candidate.substring(0, lastComplete + 1) + (inEdges ? ']}' : '],"edges":[]}');
            try {
              const data = JSON.parse(repaired);
              console.log('[KnowledgeGraph] Repaired truncated JSON, nodes:', data.nodes?.length);
              return graph_validateAndEnhance(data);
            } catch {
              // repair also failed — fall through to simpleExtract
            }
          }
          console.error('[KnowledgeGraph] JSON parse error:', parseErr.message);
        }
      }
    }

    throw new Error('Failed to extract knowledge graph');
  } catch (error) {
    console.error('[KnowledgeGraph] AI extraction failed:', error);
    console.log('[KnowledgeGraph] Falling back to simple extraction');
    return graph_validateAndEnhance(graph_simpleExtract(text));
  }
}

/**
 * Simple rule-based extraction fallback
 * @param {string} text - Text to analyze
 * @returns {Object} Basic graph data
 */
function graph_simpleExtract(text) {
  const nodes = [];
  const edges = [];

  // Extract capitalized terms (potential concepts)
  const capitalizedTerms = new Set();
  const regex = /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g;
  let match;

  while ((match = regex.exec(text)) !== null) {
    const term = match[0];
    if (term.length > 3 && !['The', 'This', 'That', 'These', 'Those'].includes(term)) {
      capitalizedTerms.add(term);
    }
  }

  // Create nodes from terms
  let id = 0;
  const termToId = new Map();

  for (const term of Array.from(capitalizedTerms).slice(0, 10)) {
    const nodeId = `node_${id++}`;
    termToId.set(term, nodeId);
    nodes.push({
      id: nodeId,
      label: term,
      type: 'concept',
      definition: `A concept mentioned in the text.`,
    });
  }

  // Create basic relationships between sequential terms
  const nodeIds = Array.from(termToId.values());
  for (let i = 0; i < nodeIds.length - 1; i++) {
    edges.push({
      source: nodeIds[i],
      target: nodeIds[i + 1],
      type: 'related_to',
      label: 'related',
    });
  }

  return { nodes, edges };
}

// Single-word labels that are never meaningful graph nodes
const GRAPH_STOP_WORDS = new Set([
  'since',
  'after',
  'before',
  'during',
  'through',
  'between',
  'within',
  'without',
  'under',
  'over',
  'above',
  'below',
  'along',
  'across',
  'against',
  'toward',
  'towards',
  'positive',
  'negative',
  'general',
  'basic',
  'simple',
  'complex',
  'various',
  'different',
  'similar',
  'common',
  'important',
  'significant',
  'major',
  'minor',
  'main',
  'key',
  'new',
  'old',
  'large',
  'small',
  'high',
  'low',
  'good',
  'bad',
  'best',
  'worst',
  'first',
  'last',
  'next',
  'previous',
  'more',
  'less',
  'most',
  'least',
  'also',
  'often',
  'usually',
  'always',
  'never',
  'sometimes',
  'further',
  'text',
  'study',
  'data',
  'model',
  'approach',
  'system',
  'factor',
  'process',
  'result',
  'effect',
  'aspect',
  'part',
  'level',
  'type',
  'form',
  'way',
  'role',
]);

// Known place labels → force type to 'place'
const KNOWN_PLACES = new Set([
  'earth',
  'arctic',
  'antarctic',
  'antarctica',
  'ocean',
  'pacific',
  'atlantic',
  'indian',
  'amazon',
  'sahara',
  'himalayas',
  'greenland',
  'tundra',
  'taiga',
  'savanna',
  'tropics',
]);

// Known event labels → force type to 'event'
const KNOWN_EVENTS = new Set([
  'industrial revolution',
  'ice age',
  'little ice age',
  'paris agreement',
  'kyoto protocol',
  'cold war',
  'world war',
  'great depression',
  'renaissance',
  'enlightenment',
]);

/**
 * Validate and enhance graph data — filter garbage nodes, fix obvious type errors
 * @param {Object} data - Raw graph data
 * @returns {Object} Enhanced graph data
 */
function graph_validateAndEnhance(data) {
  const rawNodes = data.nodes || [];

  // Filter and validate nodes
  const nodes = rawNodes
    .filter(node => {
      const label = (node.label || '').trim().toLowerCase();
      // Remove single-word stop words
      if (!label.includes(' ') && GRAPH_STOP_WORDS.has(label)) {
        return false;
      }
      // Remove empty or single-character labels
      if (label.length <= 1) {
        return false;
      }
      return true;
    })
    .map((node, idx) => {
      const id = node.id || `node_${idx}`;
      let type = NODE_TYPES[node.type] ? node.type : 'unknown';
      const labelLower = (node.label || '').toLowerCase();

      // Apply conservative type corrections for well-known categories
      if (type === 'concept' || type === 'unknown') {
        if (KNOWN_PLACES.has(labelLower)) {
          type = 'place';
        } else if (KNOWN_EVENTS.has(labelLower)) {
          type = 'event';
        }
      }

      return {
        id,
        label: node.label || `Node ${idx}`,
        type,
        definition: node.definition || '',
      };
    });

  const nodeIds = new Set(nodes.map(n => n.id));

  // Validate edges — drop any whose source/target was filtered out
  const edges = (data.edges || [])
    .filter(edge => nodeIds.has(edge.source) && nodeIds.has(edge.target))
    .map(edge => ({
      source: edge.source,
      target: edge.target,
      type: RELATION_TYPES[edge.type] ? edge.type : 'related_to',
      label: edge.label || '',
    }));

  return { nodes, edges };
}

// ============================================================================
// D3.js FORCE SIMULATION
// ============================================================================

/**
 * Initialize D3 force simulation
 */
function graph_initSimulation() {
  if (!graph_data || !graph_svg) {
    return;
  }

  const width = graph_svg.node().clientWidth || 800;
  const height = graph_svg.node().clientHeight || 600;

  // Stop existing simulation
  if (graph_simulation) {
    graph_simulation.stop();
  }

  // Create force simulation with collision detection
  graph_simulation = d3Force
    .forceSimulation(graph_data.nodes)
    // Links pull connected nodes together
    .force(
      'link',
      d3Force
        .forceLink(graph_data.edges)
        .id(d => d.id)
        .distance(150)
        .strength(graph_settings.linkStrength)
    )
    // Nodes repel each other
    .force('charge', d3Force.forceManyBody().strength(-400).distanceMin(50).distanceMax(400))
    // COLLISION DETECTION - prevents node overlap
    .force(
      'collide',
      d3Force
        .forceCollide()
        .radius(_d => graph_settings.nodeSize + 40) // Node size + label padding
        .strength(1)
        .iterations(3)
    )
    // Center the graph
    .force('center', d3Force.forceCenter(width / 2, height / 2))
    // Gentle pull toward center
    .force('x', d3Force.forceX(width / 2).strength(0.05))
    .force('y', d3Force.forceY(height / 2).strength(0.05));

  // Update positions on each tick
  graph_simulation.on('tick', graph_updatePositions);

  // Let simulation run for a bit then slow down
  graph_simulation.alpha(1).restart();
}

/**
 * Update SVG element positions during simulation
 */
function graph_updatePositions() {
  if (!graph_container) {
    return;
  }

  // Update edge positions
  graph_container
    .selectAll('.kg-edge-line')
    .attr('x1', d => d.source.x)
    .attr('y1', d => d.source.y)
    .attr('x2', d => d.target.x)
    .attr('y2', d => d.target.y);

  // Update edge labels
  graph_container
    .selectAll('.kg-edge-label')
    .attr('x', d => (d.source.x + d.target.x) / 2)
    .attr('y', d => (d.source.y + d.target.y) / 2);

  // Update node positions
  graph_container.selectAll('.kg-node').attr('transform', d => `translate(${d.x},${d.y})`);
}

// ============================================================================
// D3.js RENDERING
// ============================================================================

/**
 * Render the graph using D3 data binding
 */
function graph_render() {
  if (!graph_container || !graph_data) {
    return;
  }

  const { nodes, edges } = graph_data;

  // Clear previous content
  graph_container.selectAll('*').remove();

  // Create arrow markers for edges
  const defs = graph_container.append('defs');

  Object.entries(RELATION_TYPES).forEach(([type, config]) => {
    defs
      .append('marker')
      .attr('id', `arrow-${type}`)
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 25)
      .attr('refY', 0)
      .attr('markerWidth', 6)
      .attr('markerHeight', 6)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M0,-5L10,0L0,5')
      .attr('fill', config.color);
  });

  // Create edges layer (below nodes)
  const edgesLayer = graph_container.append('g').attr('class', 'kg-edges-layer');

  // Draw edges
  const edgeGroups = edgesLayer
    .selectAll('.kg-edge')
    .data(edges)
    .join('g')
    .attr('class', 'kg-edge');

  // Edge lines
  edgeGroups
    .append('line')
    .attr('class', 'kg-edge-line')
    .attr('stroke', d => RELATION_TYPES[d.type]?.color || '#9E9E9E')
    .attr('stroke-width', 2)
    .attr('stroke-dasharray', d => RELATION_TYPES[d.type]?.dash || '')
    .attr('marker-end', d => `url(#arrow-${d.type})`);

  // Edge labels with background
  edgeGroups
    .append('text')
    .attr('class', 'kg-edge-label')
    .attr('text-anchor', 'middle')
    .attr('dy', -5)
    .attr('font-size', '10px')
    .attr('fill', '#666')
    .style('paint-order', 'stroke')
    .style('stroke', 'white')
    .style('stroke-width', '3px')
    .text(d => d.label);

  // Create nodes layer (above edges)
  const nodesLayer = graph_container.append('g').attr('class', 'kg-nodes-layer');

  // Draw nodes
  const nodeGroups = nodesLayer
    .selectAll('.kg-node')
    .data(nodes)
    .join('g')
    .attr('class', 'kg-node')
    .style('cursor', 'pointer');

  // Node circles
  nodeGroups
    .append('circle')
    .attr('class', 'kg-node-circle')
    .attr('r', graph_settings.nodeSize)
    .attr('fill', d => NODE_TYPES[d.type]?.color || NODE_TYPES.unknown.color)
    .attr('stroke', '#fff')
    .attr('stroke-width', 2);

  // Node icons (emoji)
  nodeGroups
    .append('text')
    .attr('class', 'kg-node-icon')
    .attr('text-anchor', 'middle')
    .attr('dominant-baseline', 'central')
    .attr('font-size', `${graph_settings.nodeSize * 0.8}px`)
    .text(d => NODE_TYPES[d.type]?.icon || NODE_TYPES.unknown.icon);

  // Node labels with text outline for legibility
  nodeGroups
    .append('text')
    .attr('class', 'kg-node-label')
    .attr('text-anchor', 'middle')
    .attr('dy', graph_settings.nodeSize + 18)
    .attr('font-size', '12px')
    .attr('font-weight', '600')
    .attr('fill', '#333')
    .style('paint-order', 'stroke')
    .style('stroke', 'white')
    .style('stroke-width', '4px')
    .style('stroke-linecap', 'round')
    .style('stroke-linejoin', 'round')
    .text(d => d.label);

  // Add interactivity
  graph_addNodeInteraction(nodeGroups);
  graph_addDragBehavior(nodeGroups);
}

/**
 * Add hover and click interactions to nodes
 */
function graph_addNodeInteraction(nodeGroups) {
  nodeGroups
    .on('mouseenter', function (event, d) {
      // Highlight node
      d3Selection
        .select(this)
        .select('.kg-node-circle')
        .transition()
        .duration(200)
        .attr('r', graph_settings.nodeSize * 1.2)
        .attr('stroke', '#333')
        .attr('stroke-width', 3);

      graph_showTooltip(d, event);
    })
    .on('mousemove', function (event, d) {
      graph_showTooltip(d, event);
    })
    .on('mouseleave', function (_event, _d) {
      // Reset node
      d3Selection
        .select(this)
        .select('.kg-node-circle')
        .transition()
        .duration(200)
        .attr('r', graph_settings.nodeSize)
        .attr('stroke', '#fff')
        .attr('stroke-width', 2);

      graph_hideTooltip();
    })
    .on('click', function (event, d) {
      graph_showTooltip(d, event);
    });
}

/**
 * Add D3 drag behavior to nodes
 */
function graph_addDragBehavior(nodeGroups) {
  const drag = d3Drag
    .drag()
    .on('start', function (event, d) {
      if (!event.active && graph_simulation) {
        graph_simulation.alphaTarget(0.3).restart();
      }
      d.fx = d.x;
      d.fy = d.y;
    })
    .on('drag', function (event, d) {
      d.fx = event.x;
      d.fy = event.y;
    })
    .on('end', function (event, d) {
      if (!event.active && graph_simulation) {
        graph_simulation.alphaTarget(0);
      }
      // Release node to continue simulation
      d.fx = null;
      d.fy = null;
    });

  nodeGroups.call(drag);
}

// ============================================================================
// D3.js ZOOM BEHAVIOR (Mouse-Centered)
// ============================================================================

/**
 * Initialize D3 zoom behavior
 * D3 zoom automatically centers on mouse position
 */
function graph_initZoom() {
  if (!graph_svg || !graph_container) {
    return;
  }

  graph_zoomBehavior = d3Zoom
    .zoom()
    .scaleExtent([0.3, 3])
    .on('zoom', event => {
      graph_container.attr('transform', event.transform);
    });

  graph_svg.call(graph_zoomBehavior);

  // Enable double-click to reset zoom
  graph_svg.on('dblclick.zoom', null); // Disable default double-click zoom
}

/**
 * Programmatic zoom controls
 */
function graph_zoomIn() {
  if (!graph_svg || !graph_zoomBehavior) {
    return;
  }
  graph_svg.transition().duration(300).call(graph_zoomBehavior.scaleBy, 1.3);
}

function graph_zoomOut() {
  if (!graph_svg || !graph_zoomBehavior) {
    return;
  }
  graph_svg.transition().duration(300).call(graph_zoomBehavior.scaleBy, 0.7);
}

function graph_resetView() {
  if (!graph_svg || !graph_zoomBehavior) {
    return;
  }
  graph_svg.transition().duration(500).call(graph_zoomBehavior.transform, d3Zoom.zoomIdentity);
}

// ============================================================================
// VIEWPORT-AWARE TOOLTIP (External to panel to avoid transform containment)
// ============================================================================

/**
 * Create or get the external tooltip element
 * Must be appended to document.body to avoid transform containment issues
 * @returns {HTMLElement}
 */
function graph_getOrCreateTooltip() {
  if (graph_tooltip && document.body.contains(graph_tooltip)) {
    return graph_tooltip;
  }

  // Ensure CSS is injected (includes tooltip styles)
  graph_injectStyles();

  graph_tooltip = document.createElement('div');
  graph_tooltip.id = 'kg-tooltip-external';
  // HTML only - CSS is in GRAPH_PANEL_CSS
  graph_tooltip.innerHTML = sanitizeHTML(`
    <div class="kg-tooltip-title"></div>
    <div class="kg-tooltip-type"></div>
    <div class="kg-tooltip-def"></div>
  `);

  document.body.appendChild(graph_tooltip);
  return graph_tooltip;
}

/**
 * Show tooltip with viewport boundary clamping
 * @param {Object} node - Node data
 * @param {Event} event - Mouse event
 */
function graph_showTooltip(node, event) {
  const tooltip = graph_getOrCreateTooltip();
  if (!tooltip) {
    return;
  }

  const nodeType = NODE_TYPES[node.type] || NODE_TYPES.unknown;

  // Update content
  tooltip.querySelector('.kg-tooltip-title').textContent = node.label;
  tooltip.querySelector('.kg-tooltip-type').textContent = `${nodeType.icon} ${node.type}`;
  tooltip.querySelector('.kg-tooltip-def').textContent =
    node.definition || 'No definition available';

  // Show tooltip to measure dimensions
  tooltip.style.display = 'block';
  tooltip.style.visibility = 'hidden';

  const tooltipRect = tooltip.getBoundingClientRect();
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const margin = 10;
  const offset = 15;

  // Calculate position with smart placement
  let left, top;

  // Horizontal: try right of cursor, then left, then clamp
  const spaceOnRight = viewportWidth - event.clientX - offset - margin;
  const spaceOnLeft = event.clientX - offset - margin;

  if (spaceOnRight >= tooltipRect.width) {
    // Fits on right
    left = event.clientX + offset;
  } else if (spaceOnLeft >= tooltipRect.width) {
    // Fits on left
    left = event.clientX - tooltipRect.width - offset;
  } else {
    // Doesn't fit either side - center and clamp
    left = Math.max(
      margin,
      Math.min(viewportWidth - tooltipRect.width - margin, event.clientX - tooltipRect.width / 2)
    );
  }

  // Vertical: try below cursor, then above, then clamp
  const spaceBelow = viewportHeight - event.clientY - offset - margin;
  const spaceAbove = event.clientY - offset - margin;

  if (spaceBelow >= tooltipRect.height) {
    // Fits below
    top = event.clientY + offset;
  } else if (spaceAbove >= tooltipRect.height) {
    // Fits above
    top = event.clientY - tooltipRect.height - offset;
  } else {
    // Doesn't fit either - position at top or bottom of viewport
    top = Math.max(
      margin,
      Math.min(viewportHeight - tooltipRect.height - margin, event.clientY - tooltipRect.height / 2)
    );
  }

  // Apply position
  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
  tooltip.style.visibility = 'visible';
}

/**
 * Hide tooltip
 */
function graph_hideTooltip() {
  if (graph_tooltip) {
    graph_tooltip.style.display = 'none';
  }
}

// ============================================================================
// UI COMPONENTS
// ============================================================================

// CSS for Knowledge Graph panel (injected separately to avoid sanitization stripping)
const GRAPH_PANEL_CSS = `
  .kg-header {
    padding: 16px 20px;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .kg-title {
    font-size: 18px;
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .kg-controls {
    display: flex;
    gap: 8px;
  }
  .kg-btn {
    background: rgba(255,255,255,0.2);
    border: none;
    color: white;
    padding: 8px 12px;
    border-radius: 6px;
    cursor: pointer;
    font-size: 13px;
    transition: background 0.2s;
  }
  .kg-btn:hover {
    background: rgba(255,255,255,0.3);
  }
  .kg-close {
    background: rgba(0,0,0,0.2);
    border: none;
    color: white;
    width: 32px;
    height: 32px;
    border-radius: 50%;
    cursor: pointer;
    font-size: 18px;
    display: flex;
    align-items: center;
    justify-content: center;
    line-height: 1;
  }
  .kg-svg-container {
    flex: 1;
    position: relative;
    background: #f8f9fa;
    overflow: hidden;
  }
  .kg-svg {
    width: 100%;
    height: 100%;
    display: block;
  }
  .kg-legend {
    position: absolute;
    top: 10px;
    left: 10px;
    background: white;
    padding: 12px;
    border-radius: 8px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    font-size: 12px;
    z-index: 10;
  }
  .kg-legend-item {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 6px;
  }
  .kg-legend-color {
    width: 16px;
    height: 16px;
    border-radius: 50%;
  }
  .kg-loading {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    text-align: center;
    z-index: 10;
  }
  .kg-spinner {
    width: 48px;
    height: 48px;
    border: 4px solid #e0e0e0;
    border-top-color: #667eea;
    border-radius: 50%;
    animation: kg-spin 1s linear infinite;
    margin: 0 auto 16px;
  }
  @keyframes kg-spin {
    to { transform: rotate(360deg); }
  }
  .kg-empty {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    text-align: center;
    color: #666;
    z-index: 10;
  }
  .kg-empty-icon {
    font-size: 48px;
    margin-bottom: 16px;
  }
  .kg-zoom-controls {
    position: absolute;
    bottom: 10px;
    right: 10px;
    display: flex;
    gap: 4px;
    z-index: 10;
  }
  .kg-zoom-btn {
    width: 36px;
    height: 36px;
    background: white;
    border: 1px solid #e0e0e0;
    border-radius: 6px;
    cursor: pointer;
    font-size: 18px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .kg-zoom-btn:hover {
    background: #f0f0f0;
  }
  .kg-node {
    cursor: grab;
  }
  .kg-node:active {
    cursor: grabbing;
  }
  #kg-tooltip-external {
    position: fixed;
    background: #333;
    color: white;
    padding: 12px 16px;
    border-radius: 8px;
    font-size: 13px;
    max-width: 280px;
    pointer-events: none;
    z-index: ${Z.FLOATING};
    display: none;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  }
  #kg-tooltip-external .kg-tooltip-title {
    font-weight: 600;
    margin-bottom: 6px;
  }
  #kg-tooltip-external .kg-tooltip-type {
    font-size: 11px;
    opacity: 0.8;
    margin-bottom: 6px;
  }
  [data-assist-clickable]:hover {
    text-decoration: underline;
  }
  .kg-status {
    padding: 8px 20px;
    background: #f5f5f5;
    border-bottom: 1px solid #e0e0e0;
    font-size: 12px;
    color: #666;
    display: none;
    flex-shrink: 0;
  }
  .kg-status.visible {
    display: block;
  }
  .kg-status.error {
    background: #fff3e0;
    color: #e65100;
  }
  .kg-status[data-assist-clickable]:hover {
    text-decoration: underline;
  }
  .kg-status.success {
    background: #e8f5e9;
    color: #2e7d32;
  }
`;

/**
 * Inject Knowledge Graph CSS into document head (once)
 */
function graph_injectStyles() {
  if (document.getElementById('assist-kg-styles')) {
    return; // Already injected
  }
  const styleEl = document.createElement('style');
  styleEl.id = 'assist-kg-styles';
  styleEl.textContent = GRAPH_PANEL_CSS;
  document.head.appendChild(styleEl);
}

/**
 * Create the graph panel with SVG instead of Canvas
 * @returns {Promise<HTMLElement>}
 */
async function graph_createPanel() {
  // Inject CSS (only once)
  graph_injectStyles();

  const panel = document.createElement('div');
  panel.id = 'assist-knowledge-graph';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Knowledge Graph');

  // HTML structure only - CSS is injected separately
  panel.innerHTML = sanitizeHTML(`
    <div class="kg-header">
      <div class="kg-title">
        <span>🕸️</span>
        <span>Knowledge Graph</span>
      </div>
      <div class="kg-controls">
        <button class="kg-btn" id="kg-export">📷 Export</button>
        <button class="kg-btn" id="kg-reset">🔄 Reset View</button>
        <button class="kg-close" aria-label="Close">&times;</button>
      </div>
    </div>
    <div class="kg-status" id="kg-status"></div>

    <div class="kg-svg-container">
      <svg class="kg-svg" id="kg-svg">
        <g class="kg-container" id="kg-container"></g>
      </svg>

      <div class="kg-legend">
        <div class="kg-legend-item">
          <div class="kg-legend-color" style="background: ${NODE_TYPES.concept.color}"></div>
          <span>${NODE_TYPES.concept.icon} Concept</span>
        </div>
        <div class="kg-legend-item">
          <div class="kg-legend-color" style="background: ${NODE_TYPES.term.color}"></div>
          <span>${NODE_TYPES.term.icon} Term</span>
        </div>
        <div class="kg-legend-item">
          <div class="kg-legend-color" style="background: ${NODE_TYPES.person.color}"></div>
          <span>${NODE_TYPES.person.icon} Person</span>
        </div>
        <div class="kg-legend-item">
          <div class="kg-legend-color" style="background: ${NODE_TYPES.theory.color}"></div>
          <span>${NODE_TYPES.theory.icon} Theory</span>
        </div>
      </div>

      <div class="kg-zoom-controls">
        <button class="kg-zoom-btn" id="kg-zoom-in">+</button>
        <button class="kg-zoom-btn" id="kg-zoom-out">−</button>
      </div>

      <div id="kg-model-badge" style="display:none; position:absolute; bottom:8px; left:8px; font-size:11px; background:rgba(0,0,0,0.55); color:#fff; padding:3px 8px; border-radius:10px; pointer-events:none;"></div>

      <div class="kg-loading" id="kg-loading" style="display: none;">
        <div class="kg-spinner"></div>
        <div>Analyzing text and building graph...</div>
      </div>

      <div class="kg-empty" id="kg-empty">
        <div class="kg-empty-icon">🕸️</div>
        <div>Select text and click "Knowledge Graph" to visualize concepts</div>
      </div>
    </div>
  `);

  return panel;
}

/**
 * Initialize SVG and event listeners
 */
async function graph_initSVG() {
  if (!graph_panel) {
    return;
  }

  const svgElement = graph_panel.querySelector('#kg-svg');
  const containerElement = graph_panel.querySelector('#kg-container');

  if (!svgElement || !containerElement) {
    return;
  }

  // Use D3 selections
  graph_svg = d3Selection.select(svgElement);
  graph_container = d3Selection.select(containerElement);

  // Initialize zoom behavior
  graph_initZoom();

  // Button events
  attachInteractiveHandler(
    graph_panel.querySelector('.kg-close'),
    'Knowledge Graph Close Button',
    graph_hide
  );
  attachInteractiveHandler(
    graph_panel.querySelector('#kg-export'),
    'Knowledge Graph Export Button',
    graph_export
  );
  attachInteractiveHandler(
    graph_panel.querySelector('#kg-reset'),
    'Knowledge Graph Reset View Button',
    graph_resetView
  );
  attachInteractiveHandler(
    graph_panel.querySelector('#kg-zoom-in'),
    'Knowledge Graph Zoom In Button',
    graph_zoomIn
  );
  attachInteractiveHandler(
    graph_panel.querySelector('#kg-zoom-out'),
    'Knowledge Graph Zoom Out Button',
    graph_zoomOut
  );

  // ESC to close
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && graph_panel && graph_panel.style.display !== 'none') {
      graph_hide();
    }
  });
}

/**
 * Export graph as PNG using SVG serialization
 */
function graph_export() {
  if (!graph_svg) {
    return;
  }

  const svgElement = graph_svg.node();
  const svgData = new XMLSerializer().serializeToString(svgElement);
  const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });

  // Create canvas for PNG conversion
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const img = new Image();

  img.onload = () => {
    canvas.width = svgElement.clientWidth * 2; // 2x for higher resolution
    canvas.height = svgElement.clientHeight * 2;
    ctx.scale(2, 2);
    ctx.fillStyle = '#f8f9fa';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);

    const dataUrl = canvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.download = 'knowledge-graph.png';
    link.href = dataUrl;
    link.click();

    URL.revokeObjectURL(img.src);
    showToast?.('Graph exported as PNG');
  };

  img.src = URL.createObjectURL(svgBlob);
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Show the graph panel
 */
async function graph_show() {
  if (!graph_panel) {
    graph_panel = await graph_createPanel();

    // Apply critical styles directly to element (don't rely on CSS in innerHTML)
    Object.assign(graph_panel.style, {
      position: 'fixed',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      width: '90%',
      maxWidth: '900px',
      height: '80vh',
      background: 'white',
      borderRadius: '16px',
      boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
      zIndex: '999998',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
    });

    document.body.appendChild(graph_panel);
    await graph_initSVG();
  }

  graph_panel.style.display = 'flex';
}

/**
 * Hide the graph panel
 */
function graph_hide() {
  if (graph_panel) {
    graph_panel.style.display = 'none';
  }

  // Hide external tooltip
  graph_hideTooltip();

  if (graph_simulation) {
    graph_simulation.stop();
  }
}

/**
 * Build knowledge graph from text
 * @param {string} text - Text to analyze
 * @param {string} modelKey - Model key to use (optional, uses dropdown or default)
 */
async function graph_build(text) {
  if (!text || text.trim().length < 50) {
    showToast?.('Please select more text to build a knowledge graph');
    return;
  }

  await graph_show();

  const modeInfo = await getAIMode('knowledgeGraph');
  const availability = await checkAIAvailable(modeInfo);

  if (!availability.available) {
    if (availability.needsApiKey) {
      graph_showApiKeyWarning();
    } else {
      const statusBar = graph_panel?.querySelector('#kg-status');
      if (statusBar) {
        setAIStatusBar(statusBar, availability, 'kg-status');
      } else {
        showToast?.(`AI unavailable: ${getUnavailableStatusMessage(availability)}`);
      }
    }
    return;
  }

  // Show loading
  const loading = graph_panel?.querySelector('#kg-loading');
  const empty = graph_panel?.querySelector('#kg-empty');

  if (loading) {
    loading.style.display = 'block';
    loading.innerHTML = sanitizeHTML(`
      <div class="kg-spinner"></div>
      <div>Analyzing text with ${modeInfo.displayLabel}...</div>
    `);
  }
  if (empty) {
    empty.style.display = 'none';
  }

  try {
    graph_data = await graph_extractFromText(text, modeInfo);

    if (!graph_data.nodes.length) {
      if (empty) {
        empty.style.display = 'block';
      }
      showToast?.('Could not extract concepts from text');
      return;
    }

    // Render the graph
    graph_render();

    // Initialize force simulation
    graph_initSimulation();

    // Show which model was used
    const _kgModelBadge = graph_panel?.querySelector('#kg-model-badge');
    if (_kgModelBadge) {
      _kgModelBadge.textContent = modeInfo.isCloud
        ? `☁️ ${modeInfo.displayLabel}`
        : `💻 ${modeInfo.displayLabel}`;
      _kgModelBadge.style.display = 'block';
    }

    // Update status bar with success
    const statusBar = graph_panel?.querySelector('#kg-status');
    if (statusBar) {
      statusBar.className = 'kg-status visible success';
      statusBar.textContent = getSuccessStatusMessage(modeInfo, 'built');
    }

    // Track interaction
    window.assistFeatures?.cognitiveProfile?.track('knowledgeGraph', {
      nodeCount: graph_data.nodes.length,
      edgeCount: graph_data.edges.length,
    });
  } catch (error) {
    console.error('[KnowledgeGraph] Build failed:', error);
    showToast?.('Failed to build knowledge graph');
    if (empty) {
      empty.style.display = 'block';
    }
  } finally {
    if (loading) {
      loading.style.display = 'none';
    }
  }
}

/**
 * Show API key warning when cloud mode is enabled but no key is configured
 */
function graph_showApiKeyWarning() {
  const empty = graph_panel?.querySelector('#kg-empty');
  const loading = graph_panel?.querySelector('#kg-loading');

  if (loading) {
    loading.style.display = 'none';
  }

  if (empty) {
    empty.style.display = 'block';
    empty.innerHTML = sanitizeHTML(`
      <div style="font-size: 48px; margin-bottom: 16px;">🔑</div>
      <h3 style="margin: 0 0 12px 0; color: #333;">API Key Required</h3>
      <p style="color: #666; margin-bottom: 16px; line-height: 1.5;">
        Cloud AI mode is enabled but no API key is configured.<br>
        Please add your Anthropic API key to use cloud features.
      </p>
      <div style="display: flex; flex-direction: column; gap: 12px; align-items: center;">
        <button class="graph-open-settings" style="
          background: linear-gradient(135deg, #7c3aed 0%, #2563eb 100%);
          color: white;
          border: none;
          padding: 12px 24px;
          border-radius: 8px;
          font-size: 14px;
          cursor: pointer;
        ">⚙️ Open Advanced Options</button>
        <button class="graph-use-local" style="
          background: #6b7280;
          color: white;
          border: none;
          padding: 12px 24px;
          border-radius: 8px;
          font-size: 14px;
          cursor: pointer;
        ">💻 Use Local AI Instead</button>
      </div>
      <p style="color: #999; font-size: 12px; margin-top: 16px;">
        Go to: Extension Popup → Advanced Options → AI tab → Enter API Key
      </p>
    `);

    // Attach handlers for buttons
    const openSettingsBtn = empty.querySelector('.graph-open-settings');
    if (openSettingsBtn) {
      attachInteractiveHandler(openSettingsBtn, 'Open Settings Button', () => {
        chrome.runtime.sendMessage({ action: 'OPEN_POPUP_ADVANCED_OPTIONS' });
        alert(
          'To add your API key:\n\n1. Click the AssisT extension icon\n2. Click "Advanced Options"\n3. Go to the "AI" tab\n4. Select your AI provider and enter your API key\n5. Click Save'
        );
      });
    }

    const useLocalBtn = empty.querySelector('.graph-use-local');
    if (useLocalBtn) {
      attachInteractiveHandler(useLocalBtn, 'Use Local AI Button', async () => {
        await chrome.storage.local.set({ aiMode: 'local' });
        console.log('[KnowledgeGraph] Switched to local AI mode');
        graph_showEmptyState();
      });
    }
  }
}

/**
 * Show the empty state for building a graph
 */
function graph_showEmptyState() {
  const empty = graph_panel?.querySelector('#kg-empty');
  if (empty) {
    empty.style.display = 'block';
    empty.innerHTML = sanitizeHTML(`
      <div style="font-size: 48px; margin-bottom: 16px;">🔗</div>
      <p>Select text on the page and click "Build Knowledge Graph" to visualize concept relationships.</p>
      <p style="font-size: 13px; margin-top: 12px;">Now using Local AI mode.</p>
    `);
  }
}

/**
 * Start knowledge graph from selected text
 * @param {string} text - Selected text
 */
function graph_start(text) {
  graph_build(text);
}

// ============================================================================
// INITIALIZATION
// ============================================================================

function graph_init() {
  console.log('[KnowledgeGraph] Initializing with D3.js...');
  injectAIBadgeStyles();

  // Register to window
  if (!window.assistFeatures) {
    window.assistFeatures = {};
  }

  window.assistFeatures.knowledgeGraph = {
    show: graph_show,
    hide: graph_hide,
    build: graph_build,
    start: graph_start,
    settings: graph_settings,
  };

  // Load settings
  chrome.storage.local.get(['knowledgeGraphSettings'], result => {
    if (result.knowledgeGraphSettings) {
      Object.assign(graph_settings, result.knowledgeGraphSettings);
    }
  });

  console.log('[KnowledgeGraph] Initialized with D3.js');
}

// Auto-initialize
if (typeof window !== 'undefined') {
  graph_init();
}

// ============================================================================
// EXPORTS
// ============================================================================

export { graph_show, graph_hide, graph_build, graph_start, graph_settings };
