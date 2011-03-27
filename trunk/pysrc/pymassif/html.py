# massif/html.py

"""
Generate a webpage displaying the output of a massif profiler run.
"""

if __name__ == '__main__':
    import sys
    sys.path.append('..')

import os, sys, re, math, random, time
from collections import defaultdict
from pymassif.heapseq import HeapSeq
from pymassif.heap import HeapNode
from pymassif.util import copy_websrc_file, load_websrc_file, pprint_size

VIEW_WIDTH, VIEW_HEIGHT = 600, 400
TREEMAP_BORDER = 1
TREEMAP_PAD = 1
TREEMAP_TEXT_SIZE = 12

MERGE_LINENOS = False
MERGE_OVERLOADS = False
MERGE_TEMPLATES = False

class JavascriptDataVars:
    """
    Class used to convert a heap sequence into a set of JavaScript
    arrays that are used by ``massif.js`` to record allocation
    information.  In particular, the JavascriptDataVars class
    generates a script that defines the following variables:
    
        - times[i] = string name for the i-th time
        - graph[uid][time] = bytes used by the node with the given uid
          at the given time.  An extra entry at the end of each node's
          list gives the max_bytes value.
        - color[uid] = background color used to draw an allocsite
        - funcname[uid] = full function name
        - short_funcname[uid] = short function name
        - depth[uid] = tree depth
        - selected_time = index into times.
        - alloc_tree = nested data structure describing the shape
          of the allocation tree.

    TODO: add a prefix to all the arrays that index over uid (eg alloc_foo)?
    """
    def __init__(self, heap_seq, times=None):
        if times is None: times = sorted(heap_seq.bytes_seq)
        self.heap_seq = heap_seq
        self.times = times
        # We construct these using dicts, since there may be missing uids:
        self.graph = {}
        self.color = {}
        self.funcname = {}
        self.short_funcname = {}
        self.depth = {}
        self._add(heap_seq, [], [])
        self.alloc_tree = self._make_alloc_tree(heap_seq)
        self.peak_time = max(range(len(self.times)),
                             key=lambda i:heap_seq.bytes_seq[self.times[i]])

    def _make_alloc_tree(self, node):
        return [node.uid] + [self._make_alloc_tree(c)
                             for c in node.sorted()]

    def _add(self, node, uncles, siblings, color=None, depth=0):
        """
        Add a graph and color info for the given node to our data
        structures.

        @param uncles, siblings: used to avoid using the same color in
            locations that are "close" in the tree.  Uncles includes
            grand-uncles etc.
            
        @param color: If specified, then use this as the highlighted
            background color (all other colors are derived from that
            one).  This is used to make the first child of each node
            have the same color as that node.
        """
        # Initialize our own values.
        self.graph[node.uid] = [node.bytes_seq.get(t,0)
                                for t in self.times]
        self.graph[node.uid].append(node.max_bytes)
        if not MERGE_LINENOS and node.source_file and node.source_line:
            where = ' (%s: %s)' % (node.source_file, node.source_line)
        else:
            where = ''
        self.funcname[node.uid] = node.func+where
        self.short_funcname[node.uid] = node.short_func+where
        self.depth[node.uid] = depth
        distractors = [self.color[n.uid] for n in uncles+siblings]
        self.color[node.uid] = color or self._pick_color(distractors)
        node.color = self.color[node.uid] # [XX]FOO
        # Recurse to our children.
        children = node.sorted()
        children.reverse() # <-- makes distractor picking easier
        uncles_for_child = uncles+siblings
        for i, child in enumerate(children):
            # The first child inherits our color
            if i==len(children)-1: child_color=self.color[node.uid]
            else: child_color = None
            self._add(child, uncles_for_child, children[:i],
                      child_color, depth+1)

    def _pick_color(self, distractors):
        colors = [self._random_color() for i in range(10)]
        def sortkey(c): return sum(self._color_distance(c,d)
                                   for d in distractors)
        return sorted(colors, key=sortkey)[-1]

    def _random_color(self):
        """Return a random color, but not one that's too close to black
        or to white."""
        ranges = [[0,1], [0,1], [0,1]]
        ranges[random.randint(0,2)][0] = 0.5
        ranges[random.randint(0,2)][1] = 0.5
        return tuple(random.uniform(a,b) for (a,b) in ranges)

    def _color_distance(self, c1, c2):
        return math.sqrt(sum((a-b)**2 for a,b in zip(c1,c2)))

    def _js_color(self, color):
        return '#%s' % ''.join('%02x' % (c*255) for c in color)

    def _data_repr(self, bytes):
        # Keep the html file small by not including more precision than
        # can be usefully displayed.
        v = bytes/1024./1024.
        if v>100:
            return ('%.1f' % v).rstrip('0').rstrip('.')
        elif v>10:
            return ('%.2f' % v).rstrip('0').rstrip('.')
        else:
            return ('%.3f' % v).rstrip('0').rstrip('.')

    COMPRESS_GRAPH_DATA = False
    def _compressed_graph_data(self):
        """Replace duplicate rows with null; we will copy them on load,
        thus saving both time and memory."""
        uids = range(max(self.graph)+1)
        table = [tuple(self.graph.get(uid,())) for uid in uids]
        prev_row = None
        
        s = '['
        for row in table:
            if row is not table[0]: s+=','
            if row == prev_row and self.COMPRESS_GRAPH_DATA: s += 'null'
            else: s += '\n[%s]' % ','.join(self._data_repr(v) for v in row)
            prev_row = row
        return s+']'

#     def _compressed_name_list(self, var, names):
#         uids = range(max(self.graph)+1)
#         unique_names = sorted(set(names))
#         s = 'function make_%s() {\n' % var
#         s += '  var names = [%s];\n' % ','.join(
#             '\n      %r' % name for name in unique_names)
#         s += '  var uid2index = [%s];\n' % ','.join(
#             repr(unique_names.index(n)) for n in names)
#         s += '  var result = []\n'
#         s += '  for (int i=0; i<uid2index.length; ++i)\n'
#         s += '    result.push(names[uid2index[i]])\n'
#         s += '  return result;'
#         s += 'var %s = make_%s()\n' % (var, var)
#         return s

    def old_to_javascript(self):
        uids = range(max(self.graph)+1)
        return bar(self.heap_seq)
        s = 'var massifInfo = {\n'
        # These are real data:
        s += '  times: [%s],\n' % ','.join(
            ('%d.0' % t) for t in self.times)
        s += '  allocTree: %s,\n' % repr(self.alloc_tree).replace(' ','')
        s += '  allocSizes: %s,\n' % self._compressed_graph_data()
        s += '  funcnames: [%s],\n' % ',\n'.join(
            repr(self.funcname.get(uid,'')) for uid in uids)
        s += '  shortFuncnames: [%s],\n' % ',\n'.join(
            repr(self.short_funcname.get(uid,'')) for uid in uids)
        s += '  colors: [%s],\n' % ','.join(
            repr(self._js_color(self.color.get(uid, ''))) for uid in uids)
        s += '  selectedTime: %s,\n' % self.peak_time
        s += '  visibleTreeNodes: null, // initialized by AllocTreeView\n'
        s += '  visibleTreeLeaves: null, // initialized by AllocTreeView\n'
        # This one is marginal
        s += '  depth: [%s],\n' % ','.join(
            repr(self.depth.get(uid,-1)) for uid in uids)
        # But these should go away
        s += '  view_width: %s,\n' % VIEW_WIDTH
        s += '  view_height: %s,\n' % VIEW_HEIGHT
        s += '  treemap_pad: %s,\n' % TREEMAP_PAD
        s += '  treemap_text_size: %s,\n' % TREEMAP_TEXT_SIZE
        s += '  treemap_border: %s,\n' % TREEMAP_BORDER
        s += '};\n';
        # And this is just for backwards compatibility for now
        s += '// backwards compatibility:\n'
        s += 'var alloc_tree = massifInfo.allocTree;\n'
        s += 'var graph_data = massifInfo.allocSizes;\n'
        s += 'var funcname = massifInfo.funcnames;\n'
        s += 'var short_funcname = massifInfo.shortFuncnames;\n'
        s += 'var depth = massifInfo.depth;\n'
        s += 'var graph_colors = massifInfo.colors;\n'
        s += 'var times = massifInfo.times;\n'
        s += 'var view_width = massifInfo.view_width;\n'
        s += 'var view_height = massifInfo.view_height;\n'
        s += 'var selected_time = massifInfo.selected_time;\n'
        s += 'var treemap_pad = massifInfo.treemap_pad;\n'
        s += 'var treemap_text_size = massifInfo.treemap_text_size;\n'
        s += 'var treemap_border = massifInfo.treemap_border;\n'
        return s

    def to_javascript(self):
        uids = range(max(self.graph)+1)
        result = []
        out = result.append
        out('var massifData = new MassifData({\n')
        out('  times: [%s],\n' % ','.join(('%d' % t) for t in self.times))
        out('  selectedTime: %s,\n' % self.peak_time)
        out('  heapSeq: ')
        self._nodetojs(self.heap_seq, times=self.times,
                       out=out, indent='    ')
        out('\n  });\n')
        return ''.join(result)

    def _nodetojs(self, node, times, out, indent='', parent_bytes_seq=None):
        color = self._js_color(self.color[node.uid])
        out('new HeapSeqNode(%s, %r,\n%s %r,\n%s %r,' %
            (node.uid, color, indent, node.func, indent, node.short_func))
        bytes_seq = [node.bytes_seq.get(t,0) for t in times]
        out('\n%s ' % indent)
        if bytes_seq == parent_bytes_seq:
            out('null,')
        else:
            out('[%s],' % (','.join(_size_repr(bytes) for bytes in bytes_seq)))
        out('\n%s [' % indent)
        for i, child in enumerate(node.sorted()):
            if i: out(',\n%s  ' % indent)
            self._nodetojs(child, times, out, indent+'  ', bytes_seq)
        out('])')


def _size_repr(bytes):
    # Keep the html file small by not including more precision than
    # can be usefully displayed.
    v = bytes/1024./1024.
    if v>100:
        return ('%.1f' % v).rstrip('0').rstrip('.')
    elif v>10:
        return ('%.2f' % v).rstrip('0').rstrip('.')
    else:
        return ('%.3f' % v).rstrip('0').rstrip('.')
        
    

def write_html_output(heap_seq, outdir):
    print 'Writing to %s...' % outdir
    if not os.path.exists(outdir):
        os.makedirs(outdir)
    copy_aux_files(outdir)

    times = sorted(heap_seq.bytes_seq)
    # Bottom-up page:
    #print '  - Bottom-up alloc page'
    #bu_heap = heap_seq.copy()
    #bu_heap.promote_if_parent_matches('std::', '__gnu_cxx::', 'boost::')
    #write_html_page_for(bu_heap, os.path.join(outdir, 'bu_alloc.html'), times)
    #print '  - Top-down top page'
    #write_html_page_for(heap_seq.inverted(),os.path.join(outdir, 'td_top.html'), times)
    node = heap_seq
    node = node.sorted()[1]
    #for i in range(1): node = node.sorted()[0]
    #node = heap_seq.inverted()
    #node = node.sorted()[0]
    #node = node.sorted()[1]
    write_html_page_for(node, os.path.join(outdir, 'td_test.html'), times)
    return node

def copy_aux_files(outdir):
    for f in ['plus.gif', 'minus.gif', 'bullet.gif', 'play.gif',
              'pause.gif', 'massif.css', 'massif_data.js',
              'view.js', 'alloc_tree_view.js', 'popupmenu.js',
              'sparklines_view.js', 'memgraph_view.js',
              'treemap_view.js']:
        copy_websrc_file(f, os.path.join(outdir, f))

def write_html_page_for(heap_seq, filename, times=None):
    #heap_seq = heap_seq.merged_by_func(True, True)
    if MERGE_LINENOS:
        heap_seq = heap_seq.merged_by_func(MERGE_OVERLOADS,
                                           MERGE_TEMPLATES)
    #heap_seq.collapse_to_depth(20)
    #heap_seq.collapse_if_smaller_than(heap_seq.bytes*0.005)
    heap_seq.group_small_nodes()
    heap_seq.discard_empty_nodes()
    heap_seq.reset_uids(0)

    # Generate the javascript code that defines the data arrays.
    javascript = JavascriptDataVars(heap_seq, times).to_javascript()

    # Generate the html page,
    html = load_websrc_file('massif.html') % dict(
        javascript=javascript,
        timestamp=time.ctime(),
        title='%s' % heap_seq.func)
    with open(filename,'wb') as out:
        out.write(html)
        
if __name__ == '__main__':
    import pymassif.snapshot, pymassif.heapseq, pymassif.heap, pymassif.util
    if False:
        reload(pymassif.util)
        reload(pymassif.heap)
        reload(pymassif.heapseq)
        reload(pymassif.snapshot)
    massif_file = open('../../../../arabic-small-parser.massif').read()
    #print 'Reading snapshots...'
    sshots = pymassif.snapshot.Snapshot.parse_all(massif_file)
    # Merge all the snapshot info into one data structure.
    #print 'Merging snapshots...'
    heap_seq = pymassif.heapseq.HeapSeq(sshots)
    print 'Writing output...'
    node = write_html_output(heap_seq, 'test')
    

