# massif/heapseq.py

"""
A data structure that encodes a sequence of massif heap trees (from
subsequent snapshots) in a single tree structure.  This makes it
easier to track how the memory usage of individual allocation sites
changes over time.
"""

if __name__ == '__main__':
    import sys
    sys.path.append('..')

import pymassif.heap
import collections, textwrap, copy, re, random, math

def HeapSeq(snapshots, include_overhead=True, include_stacks=True):
    alloc = pymassif.heap.HeapNode.ALLOCATION
    heap_seq = HeapSeqNode(None, alloc, None, None, False)
    for sshot in snapshots:
        if sshot.heap_tree is None: continue
        heap_seq.merge(sshot.time, sshot.heap_tree)
        overhead = sshot.mem_heap_extra
        if include_overhead and overhead>0:
            node = pymassif.heap.HeapNode(None, alloc, children=[
                pymassif.heap.HeapNode(None, 'Overhead', bytes=overhead)])
            heap_seq.merge(sshot.time, node)
        if include_stacks and sshot.mem_stacks>0:
            node = pymassif.heap.HeapNode(None, alloc, children=[
                pymassif.heap.HeapNode(None, 'Stacks', bytes=sshot.mem_stacks)])
            heap_seq.merge(sshot.time, node)
            
                           
    return heap_seq

class HeapSeqNode(object):
    """
    A data structure that encodes a sequence of massif heap trees (from
    subsequent snapshots) in a single tree structure.  This makes it
    easier to track how the memory usage of individual allocation
    sites changes over time.
    """
    _uid_counter = 0
    def __init__(self, addr, func, source_file, source_line, is_leaf):
        if isinstance(func, basestring):
            print 'parsing: %r' % func
            func = pymassif.heap.FunctionName.parse(func)
        assert isinstance(func, pymassif.heap.FunctionName)
        self._addr = addr
        self._func = func
        self._source_file = source_file
        self._source_line = source_line
        self._children = []
        if is_leaf:
            self._bytes_seq = collections.defaultdict(int)
        else:
            self._bytes_seq = None
        self._uid = self.__class__._uid_counter
        self.__class__._uid_counter += 1

    def merge(self, time, heap_node):
        if heap_node.is_leaf and heap_node.bytes == 0:
            return # empty leaf node!
        # Sanity checks:
        #if self.is_leaf and time in self._bytes_seq:
        #    raise ValueError('Attempt to double-merge the same time!')
        if self.is_leaf != heap_node.is_leaf:
            # This can happen eg if we prune one tree but not the other.
            raise ValueError('Cannot merge: incompatible heap trees')
            
        if self.is_leaf:
            self._bytes_seq[time] += heap_node.bytes
        else:
            for src_child in heap_node:
                # If we have a child that matches the source child,
                # then merge the source child into that child.
                for dst_child in self:
                    if dst_child._matches(src_child):
                        dst_child.merge(time, src_child)
                        break
                # Otherwise, create a new child for the source child.
                else:
                    dst_child = HeapSeqNode(src_child.addr, src_child.func,
                                            src_child.source_file,
                                            src_child.source_line,
                                            src_child.is_leaf)
                    self._children.append(dst_child)
                    dst_child.merge(time, src_child)

    def _matches(self, other):
        return ((self.func, self.source_file, self.source_line) ==
                (other.func, other.source_file, other.source_line))
        #return (self.addr, self.func) == (other.addr, other.func)
    
    def copy(self):
        """Return a deep copy of this HeapSeqNode."""
        return copy.deepcopy(self)

    ######################################################################
    #{ Accessors
    ######################################################################

    # Read-only attributes:
    addr = property(lambda self: self._addr)
    func = property(lambda self: self._func)
    source_file = property(lambda self: self._source_file)
    source_line = property(lambda self: self._source_line)
    uid = property(lambda self: self._uid)
    is_leaf = property(lambda self: self._bytes_seq is not None)
    
    @property
    def bytes(self):
        return max(self.bytes_seq.values()+[0])

    @property
    def max_bytes(self):
        if self.is_leaf:
            if self._bytes_seq:
                return max(self._bytes_seq.values())
            else:
                return 0
        else:
            return sum(c.max_bytes for c in self._children)

    @property
    def bytes_seq(self):
        result = collections.defaultdict(int)
        self._collect_bytes_seq(result)
        return result

    @property
    def peak_time(self):
        return max((bytes,time) for (time,bytes) in self.bytes_seq.items())[1]

    def _collect_bytes_seq(self, result):
        if self.is_leaf:
            for time, bytes in self._bytes_seq.items():
                result[time] += bytes
        else:
            for child in self._children:
                child._collect_bytes_seq(result)
                
    def __getitem__(self, index):
        return self._children[index]
    def __len__(self):
        return len(self._children)
    def __iter__(self):
        return iter(self._children)

    def sorted(self):
        return sorted(self._children, key=self.__class__._sort_key)

    def _sort_key(self):
        return (self.func.name.startswith('Other Allocations'),
                self.func.name==pymassif.heap.HeapNode.ALLOCATION,
                -self.bytes)

    ######################################################################
    #{ Display/Output
    ######################################################################

    def __repr__(self):
        return '<HeapSeqNode: %s>' % pymassif.util.pprint_size(self.bytes)

    def __str__(self):
        return self.pprint()

    def pprint(self, bargraphs=True, indent='', depth=-1):
        return self._pprint(bargraphs, indent, depth,
                            sorted(self.bytes_seq.keys()))

    def _pprint(self, bargraphs, indent, depth, times):
        if indent:
            s = '%s+- %s' % (indent[:-2], self.func)
        else:
            s = '%s' % self.func
        if depth == 0: return s
        if self.is_leaf or True:
            if bargraphs:
                if self._children:
                    s += '\n' + self._bargraph(indent+'| ', times)
                else:
                    s += '\n' + self._bargraph(indent+'  ', times)
            else:
                s += '\n' + self._alloc_list(indent, times)
        children = sorted(self._children, key=lambda c:-c.bytes)
        for child in children[:-1]:
            s += '\n' + child._pprint(bargraphs, indent+'| ', depth-1, times)
        for child in children[-1:]:
            s += '\n' + child._pprint(bargraphs, indent+'  ', depth-1, times)
        return s

    def _bargraph(self, indent, times, height=5):
        bytes_seq = self.bytes_seq
        bytes_list = [bytes_seq.get(t,0) for t in times]
        max_bytes = max(bytes_list)
        row_bytes = max_bytes/float(height)
        rows = [indent]*height
        for i in range(len(rows)):
            rows[i] += '%8s |' % pymassif.util.pprint_size(row_bytes*(i+1))
            for bytes in bytes_list:
                if bytes >= row_bytes*(i+1):
                    rows[i] += ':'
                elif bytes >= row_bytes*(i+0.5):
                    rows[i] += '.'
                elif i == 0:
                    rows[i] += '_'
                else:
                    rows[i] += ' '
        return '\n'.join(reversed(rows))
    
    def _alloc_list(self, indent, times):
        sizes = ', '.join(pymassif.util.pprint_size(self._bytes_seq.get(t,0))
                          for t in times)
        return textwrap.fill(sizes,
                             initial_indent=indent+'Allocations: ',
                             subsequent_indent=indent+' '*13)

    ######################################################################
    #{ Javascript Serialization
    ######################################################################

    def to_javascript(self, times=None, indent=''):
        if times is None: times = sorted(self.bytes_seq)
        return self._to_javascript(times, indent, None, self._pick_colors())
        
    def _to_javascript(self, times, indent, parent_bytes_list, color_dict):
        bytes_seq = self.bytes_seq
        bytes_list = [bytes_seq.get(t,0) for t in times]
        color = self._js_color(color_dict[self])
        s = 'new HeapSeqNode(%s, %r,\n%s ' % (self.uid, color, indent)
        for piece in self.func.pieces() + (self.source_file, self.source_line):
            if piece is None: s += "'', "
            else: s += "%r, " % piece
        s += '\n'
        if bytes_list == parent_bytes_list:
            s += '%s null,' % indent # means "copy from parent"
        else:
            s += '%s [%s],' % (indent,
                               ','.join(self._javascript_size_repr(bytes)
                                        for bytes in bytes_list))
        s += '\n%s [' % indent
        for i, child in enumerate(self.sorted()):
            if i: s += ',\n%s  ' % indent
            s += child._to_javascript(times, indent+' ', bytes_list, color_dict)
        s += '])'
        return s

    def _javascript_size_repr(self, bytes):
        # Keep the html file small by not including more precision than
        # can be usefully displayed.
        v = bytes/1024./1024.
        if v>100:  return ('%.1f' % v).rstrip('0').rstrip('.')
        elif v>10: return ('%.2f' % v).rstrip('0').rstrip('.')
        else:      return ('%.3f' % v).rstrip('0').rstrip('.')
    
    def _js_color(self, color):
        return '#%s' % ''.join('%02x' % (c*255) for c in color)

    def _pick_colors(self, result=None, color=None, siblings=()):
        """
        Return a dictionary mapping from node to color.
        """
        if result is None: result = {}

        # Get a list of distractors -- i.e., colors that we should
        # avoid.  This currently consists of the colors of any
        # preceeding siblings, plus the colors of the rightmost
        # descendents of the most recent sibling.
        distractors = set(result[node] for node in siblings)
        if siblings:
            node = siblings[-1]
            while len(node)>0:
                node = node.sorted()[-1]
                distractors.add(result[node])
                
        # Pick a color for ourselves.  If a color was specified as a
        # parameter (because we are the first child of our parent, and
        # should use the same color), then use that color.  Otherwise,
        # pick a random color, avoiding the distractors.
        result[self] = color or self._pick_color(distractors)

        # Pick colors for our children.
        children = self.sorted()
        for i, child in enumerate(children):
            if i==0: child_color = result[self]
            else: child_color = None
            child._pick_colors(result, child_color, children[:i])

        return result

    def _pick_color(self, distractors):
        """
        Return a random color; but try not to pick one that's close to
        any of the given distractors.
        """
        if distractors:
            colors = [self._random_color() for i in range(10)]
            def sortkey(c): return min(self._color_distance(c,d)
                                       for d in distractors)
            return sorted(colors, key=sortkey)[-1]
        else:
            return self._random_color()

    def _random_color(self):
        """
        Return a random color, but not one that's too close to black
        or to white.  Colors are encoded as (r,g,b) tuples, where each
        component ranges from 0 to 1.
        """
        ranges = [[0,1], [0,1], [0,1]]
        ranges[random.randint(0,2)][0] = 0.5
        ranges[random.randint(0,2)][1] = 0.5
        return tuple(random.uniform(a,b) for (a,b) in ranges)
        
    def _color_distance(self, c1, c2):
        """Return the distance between two colors.  A low distance
        indicates that the colors are similar."""
        return math.sqrt(sum((a-b)**2 for a,b in zip(c1,c2)))


    ######################################################################
    #{ Transforms (do not modify this, but return new HeapSeqNodes)
    ######################################################################

    def inverted(self, top_node_func='TOP'):
        dst = HeapSeqNode(None, top_node_func, None, None, False)
        self._invert(dst, [])
        assert dst.bytes_seq == self.bytes_seq
        return dst

    def _invert(self, dst, ancestors):
        """
        Copy an inverted version of self into dst.

        @param ancestors: A list of the ancestors of this node.
        """
        if self.bytes == 0:
            return # Don't bother to keep empty nodes.
        ancestors.append(self)
        if self.is_leaf:
            # Find where we should go in the inverted tree.  Use existing
            # nodes when possible, but create nodes if necessary.
            for node in reversed(ancestors):
                for dst_child in dst:
                    if node._matches(dst_child):
                        dst = dst_child
                        break
                else:
                    dst._children.append(HeapSeqNode(
                        node.addr, node.func, node.source_file,
                        node.source_line, False))
                    dst = dst[-1]
            # Turn the node corresponding to the fomer root node into
            # a leaf node.
            assert dst._bytes_seq is None
            assert dst._children == []
            dst._bytes_seq = self.bytes_seq
        else:
            for child in self:
                child._invert(dst, ancestors)
        ancestors.pop()

#     def merged_by_func(self, merge_overloads=False, merge_templates=True):
#         if self.is_leaf: return self

#         # Construct a new result node.
#         result = HeapSeqNode(self.addr, self.func, self.source_file,
#                              self.source_line, False)
        
#         # Group the nodes by their function.
#         func2nodes = collections.defaultdict(list)
#         for node in self:
#             func = node.func
#             func = _strip_func(node.func, not merge_templates,
#                                not merge_overloads, not merge_overloads)
#             func2nodes[func].append(node)

#         # Merge each group of nodes into a single merged child node
#         for (func, nodes) in func2nodes.items():
#             assert all(node.is_leaf==nodes[0].is_leaf for node in nodes)
#             source_lines = set(n.source_line for n in nodes
#                                if n.source_line is not None)
#             if source_lines: source_line = ', '.join(sorted(source_lines))
#             else: source_line = None
#             #if len(source_lines)==1: source_line=source_lines.pop()
#             #else: source_line=None
#             merged_child = HeapSeqNode(nodes[0].addr, func,
#                                        nodes[0].source_file,
#                                        source_line,
#                                        nodes[0].is_leaf)
#             if nodes[0].is_leaf:
#                 for node in nodes:
#                     node._collect_bytes_seq(merged_child._bytes_seq)
#             else:
#                 for node in nodes:
#                     merged_child._children.extend(node._children)
#                 merged_child = merged_child.merged_by_func(merge_overloads,
#                                                            merge_templates)
#             result._children.append(merged_child)
#         return result

    ######################################################################
    #{ Modifiers (change this HeapSeq)
    ######################################################################
    # None of these methods change the total memory that is recorded
    # by the heap tree -- they just re-arrange it and aggregate it.

    def discard_empty_nodes(self):
        for child in list(self):
            if child.bytes==0:
                self._children.remove(child)
            else:
                child.discard_empty_nodes()

    def reset_uids(self, start=None):
        """
        Re-assign UIDs to this node and all its children, starting at
        the given number.  This should only be called on the top-level
        node of a heap sequence tree.  Warning: using this carelessly
        can result in two HeapSeqNodes with the same uid.
        """
        if start is None:
            start = self.__class__._uid_counter
        counter = [start]
        self._reset_uids(counter)
        self.__class__._uid_counter = max(self.__class__._uid_counter,
                                          counter[0])

    def _reset_uids(self, counter):
        self._uid = counter[0]
        counter[0] += 1
        for child in self:
            child._reset_uids(counter)

    def collapse(self):
        """
        Remove all children from this non-leaf node.  This node
        becomes a leaf node, with size equal to the sum of the sizes
        of the removed children.
        """
        self._bytes = self.bytes
        self._children = ()

    def collapse_to_depth(self, depth):
        if depth<=0:
            self.collapse()
        else:
            for child in self:
                child.collapse_to_depth(depth-1)

    def group_small_nodes(self, cutoff_percent=1, min_large_children=1,
                          min_small_children=4):
        """
        Find nodes that have at least one child above the cutoff size,
        and at least four children below the cutoff size; and introduce
        a new node named 'Other Allocations' to hold the small
        children.  If the node in question has an ALLOCATIONS child,
        then it will also be put in the new 'Other Allocations' node.
        """
        cutoff_bytes = self.bytes * (cutoff_percent/100.0)
        large_children = [c for c in self if c.bytes >= cutoff_bytes]
        small_children = [c for c in self if c.bytes < cutoff_bytes]
        if (len(large_children)>=min_large_children and
            len(small_children)>=min_small_children):
            max_pct = max(100.0*c.bytes/self.bytes for c in small_children)+.1
            func = 'Other Allocations (below %.1f%% of parent)' % max_pct
            group = HeapSeqNode(None, func, None, None, False)
            group._children = small_children
            self._children = large_children + [group]
            for child in large_children:
                child.group_small_nodes(cutoff_percent, min_large_children,
                                        min_small_children)
        else:
            for child in self:
                child.group_small_nodes(cutoff_percent, min_large_children,
                                        min_small_children)

    def collapse_if_smaller_than(self, cutoff_bytes):
        if self.bytes < cutoff_bytes:
            self.collapse()
        else:
            for child in self:
                child.collapse_if_smaller_than(cutoff_bytes)

    def collapse_if_func_matches(self, *regexps):
        """
        Perform a depth-first search of this HeapSeq, and collapse
        any node whose function matches any of the given regexps.
        """
        for child in list(self):
            child.collapse_if_func_matches(*regexps)
            if (any(re.match(r, child.func) for r in regexps) and
                not child.is_leaf):
                self._children.extend(child._children)
                self._children.remove(child)

    def promote(self, descendent):
        """
        Move a descendent of this HeapSeq to be a direct child of
        this HeapSeq instead.
        """
        if not self._remove(descendent):
            raise ValueError('Node is not a descendent!')
        assert not self.is_leaf
        self._children.append(descendent)

    def promote_if_parent_matches(self, *regexps):
        """
        Perform a depth-first search of this HeapSeq, and if any
        descendent is found whose parent matches one of the given
        regexps, then promote that descendent to be a direct child of
        this node.  Children are checked before their parents.
        """
        self._promote_if_parent_matches(regexps, self)
            
    def _promote_if_parent_matches(self, regexps, root):
        for child in list(self):
            child._promote_if_parent_matches(regexps, root)
        if any(re.match(r,self.func) for r in regexps):
            for child in list(self):
                root.promote(child)
            
    def _remove(self, node):
        """Helper used by promote()"""
        if node in self._children:
            self._children.remove(node)
            return True
        for child in self._children:
            if child._remove(node): return True
        return False

# def _strip_func(func, keep_templates=False, keep_args=False, keep_rtype=False):
#     # If it's a special symbol, return it as-is.
#     if func in (pymassif.heap.HeapNode.ALLOCATION,
#                 pymassif.heap.HeapNode.OTHER_CALLERS,
#                 '???', '(below main)'):
#         return func
#     if func.startswith('Other Allocations ('): return func
    
#     # If it's already just a name (eg __libc_csu_init) then return it as-is
#     if re.match('^\w+$', func): return func
    
#     # Otherwise, we'll need to parse it.
#     original_func = func
#     func = re.sub(' \(in [^\(\)]+\)$', '', func)
#     template_depth = 0
#     started_args = False
#     result = ''
#     for piece in re.findall(r'\(anonymous namespace\)|\(below main\)|'
#                             r'operator ?[^\s\(]+ |[<> \(\)]|.', func):
#         #print template_depth, piece, `result`
#         if piece=='<':
#             template_depth += 1
#             if keep_templates: result += piece
#         elif piece == '>':
#             template_depth -= 1
#             if keep_templates: result += piece
#         elif piece == '>>' and template_depth > 1:
#             template_depth -= 2
#             if keep_templates: result += piece
#         elif piece == ' ' and template_depth==0:
#             if not (started_args or re.search(r'\boperator$', result)):
#                 #print 'RTYPE %r' % original_func
#                 if keep_rtype: result += piece
#                 else: result = ''
#             else: result += piece
#         elif piece == '(':
#             if not started_args:
#                 started_args = True
#                 assert template_depth==0, original_func
#                 if not keep_args: break
#             result += piece
#         elif piece == ')':
#             result += piece
#         elif template_depth == 0 or keep_templates: result += piece
#     if not result or not started_args:
#         print 'Warning: trouble parsing: %r' % original_func
#         result = func # eg for "(below main)" or "Other callers".
#     return result

if __name__ == '__main__w':
    import pymassif.snapshot, pymassif.heapseq, pymassif.heap, pymassif.util
    reload(pymassif.util)
    reload(pymassif.heap)
    reload(pymassif.heapseq)
    massif_file = open('pymassif.out.10367').read()
    sshots = pymassif.snapshot.Snapshot.parse_all(massif_file)
    print len(sshots)
    heap_seq = pymassif.heapseq.HeapSeq(sshots)
    x = str(heap_seq)
    print heap_seq.inverted().pprint(depth=4)
    

