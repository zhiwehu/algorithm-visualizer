import { Data } from '/core/datas';
import { distance } from '/common/util';
import { tracerManager } from '/core';

class GraphData extends Data {
  getDefaultOptions() {
    return {
      ...super.getDefaultOptions(),
      directed: true,
      weighted: false,
    };
  }

  init() {
    super.init();
    this.dimensions = {
      baseWidth: 320,
      baseHeight: 320,
      padding: 32,
      nodeRadius: 12,
      arrowGap: 4,
      nodeWeightGap: 4,
      edgeWeightGap: 4,
    };
    this.logData = null;
    this.callLayout = { method: this.layoutCircle, args: [] };
  }

  set(array2d = []) {
    const { weighted } = this.options;
    this.nodes = [];
    this.edges = [];
    for (let i = 0; i < array2d.length; i++) {
      this.addNode(i);
      for (let j = 0; j < array2d.length; j++) {
        const value = array2d[i][j];
        if (value) {
          this.addEdge(i, j, weighted ? value : null);
        }
      }
    }
    this.layout();
    super.set();
  }

  addNode(id, weight = null, visitedCount = 0, selectedCount = 0, x = 0, y = 0) {
    if (this.findNode(id)) return;
    this.nodes.push({ id, weight, visitedCount, selectedCount, x, y });
    this.layout();
  }

  addEdge(source, target, weight = null, visitedCount = 0, selectedCount = 0) {
    if (this.findEdge(source, target)) return;
    this.edges.push({ source, target, weight, visitedCount, selectedCount });
    this.layout();
  }

  updateNode(id, update) {
    const node = this.findNode(id);
    Object.assign(node, update);
  }

  findNode(id) {
    return this.nodes.find(node => node.id === id);
  }

  findEdge(source, target, directed = this.options.directed) {
    if (directed) {
      return this.edges.find(edge => edge.source === source && edge.target === target);
    } else {
      return this.edges.find(edge =>
        edge.source === source && edge.target === target ||
        edge.source === target && edge.target === source);
    }
  }

  findLinkedEdges(source, directed = this.options.directed) {
    if (directed) {
      return this.edges.filter(edge => edge.source === source);
    } else {
      return this.edges.filter(edge => edge.source === source || edge.target === source);
    }
  }

  findLinkedNodeIds(source, directed = this.options.directed) {
    const edges = this.findLinkedEdges(source, directed);
    return edges.map(edge => edge.source === source ? edge.target : edge.source);
  }

  findLinkedNodes(source, directed = this.options.directed) {
    const ids = this.findLinkedNodeIds(source, directed);
    return ids.map(id => this.findNode(id));
  }

  getRect() {
    const { baseWidth, baseHeight, padding } = this.dimensions;
    const left = -baseWidth / 2 + padding;
    const top = -baseHeight / 2 + padding;
    const right = baseWidth / 2 - padding;
    const bottom = baseHeight / 2 - padding;
    const width = right - left;
    const height = bottom - top;
    return { left, top, right, bottom, width, height };
  }

  layout() {
    const { method, args } = this.callLayout;
    method.apply(this, args);
  }

  layoutCircle() {
    this.callLayout = { method: this.layoutCircle, args: arguments };
    const rect = this.getRect();
    const unitAngle = 2 * Math.PI / this.nodes.length;
    let angle = -Math.PI / 2;
    for (const node of this.nodes) {
      const x = Math.cos(angle) * rect.width / 2;
      const y = Math.sin(angle) * rect.height / 2;
      node.x = x;
      node.y = y;
      angle += unitAngle;
    }
  }

  layoutTree(root = 0, sorted = false) {
    this.callLayout = { method: this.layoutTree, args: arguments };
    const rect = this.getRect();

    if (this.nodes.length === 1) {
      const [node] = this.nodes;
      node.x = (rect.left + rect.right) / 2;
      node.y = (rect.top + rect.bottom) / 2;
      return;
    }

    let maxDepth = 0;
    const leafCounts = {};
    let marked = {};
    const recursiveAnalyze = (id, depth) => {
      marked[id] = true;
      leafCounts[id] = 0;
      if (maxDepth < depth) maxDepth = depth;
      const linkedNodeIds = this.findLinkedNodeIds(id, false);
      for (const linkedNodeId of linkedNodeIds) {
        if (marked[linkedNodeId]) continue;
        leafCounts[id] += recursiveAnalyze(linkedNodeId, depth + 1);
      }
      if (leafCounts[id] === 0) leafCounts[id] = 1;
      return leafCounts[id];
    };
    recursiveAnalyze(root, 0);

    const hGap = rect.width / leafCounts[root];
    const vGap = rect.height / maxDepth;
    marked = {};
    const recursivePosition = (node, h, v) => {
      marked[node.id] = true;
      node.x = rect.left + (h + leafCounts[node.id] / 2) * hGap;
      node.y = rect.top + v * vGap;
      const linkedNodes = this.findLinkedNodes(node.id, false);
      if (sorted) linkedNodes.sort((a, b) => a.id - b.id);
      for (const linkedNode of linkedNodes) {
        if (marked[linkedNode.id]) continue;
        recursivePosition(linkedNode, h, v + 1);
        h += leafCounts[linkedNode.id];
      }
    };
    const rootNode = this.findNode(root);
    recursivePosition(rootNode, 0, 0);
  }

  layoutRandom() {
    this.callLayout = { method: this.layoutRandom, args: arguments };
    const rect = this.getRect();
    const placedNodes = [];
    for (const node of this.nodes) {
      do {
        node.x = rect.left + Math.random() * rect.width;
        node.y = rect.top + Math.random() * rect.height;
      } while (placedNodes.find(placedNode => distance(node, placedNode) < 48));
      placedNodes.push(node);
    }
  }

  visit(target, source, weight) {
    this.visitOrLeave(target, source, weight, true);
  }

  leave(target, source, weight) {
    this.visitOrLeave(target, source, weight, false);
  }

  visitOrLeave(target, source, weight, visit) {
    const edge = this.findEdge(source, target);
    if (edge) edge.visitedCount += visit ? 1 : -1;
    const node = this.findNode(target);
    node.weight = weight;
    node.visitedCount += visit ? 1 : -1;
    if (this.logData) {
      this.logData.print(visit ? (source || '') + ' -> ' + target : (source || '') + ' <- ' + target);
    }
  }

  select(target, source) {
    this.selectOrDeselect(target, source, true);
  }

  deselect(target, source) {
    this.selectOrDeselect(target, source, false);
  }

  selectOrDeselect(target, source, select) {
    const edge = this.findEdge(source, target);
    if (edge) edge.selectedCount += select ? 1 : -1;
    const node = this.findNode(target);
    node.selectedCount += select ? 1 : -1;
    if (this.logData) {
      this.logData.print(select ? (source || '') + ' => ' + target : (source || '') + ' <= ' + target);
    }
  }

  log(tracerKey) {
    this.logData = tracerKey ? tracerManager.datas[tracerKey] : null;
  }
}

export default GraphData;