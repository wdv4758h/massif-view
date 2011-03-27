# massif/heap.py
"""
A data structure that encodes the contents of a single massif heap dump.
"""

import re
import pymassif.util

def HeapTree(s):
    """
    Parse a string containing a massif heap tree, and return it as a
    tree of HeapNode objects.
    """
    return HeapNode.parse(s)

class HeapNode(object):
    """
    A single node in a heap tree structure, consisting of:
      - The function's name
      - The file that defined the function
      - The line number on which the file occured
      - An address 
      - A list of children
      - A size (in bytes)
      - A unique identifier (guaranteed to be unique within the tree)

    Nodes are divided into two types: leaf nodes have no children, and
    directly contain some number of bytes.  Non-leaf nodes have one or
    more children, and their size is defined as the sum of their
    childrens' sizes.
    """
    _uid_counter = 0
    def __init__(self, addr, func, source_file=None, source_line=None,
                 children=(), bytes=None):
        # We only record bytes at the leaf nodes:
        assert children==() or bytes is None
        self._addr = addr
        self._func = func
        self._children = list(children)
        self._bytes = bytes
        self._source_file = source_file
        self._source_line = source_line
        self._uid = self.__class__._uid_counter
        self.__class__._uid_counter += 1

    ######################################################################
    #{ Accessors
    ######################################################################

    # Read-only attributes:
    addr = property(lambda self: self._addr)
    func = property(lambda self: self._func)
    source_file = property(lambda self: self._source_file)
    source_line = property(lambda self: self._source_line)
    uid = property(lambda self: self._uid)
    is_leaf = property(lambda self: self._bytes is not None)
    
    @property
    def bytes(self):
        if self.is_leaf:
            return self._bytes
        else:
            return sum(c.bytes for c in self._children)

    def __getitem__(self, index):
        return self._children[index]
    def __len__(self):
        return len(self._children)
    def __iter__(self):
        return iter(self._children)

    ######################################################################
    #{ Display/Output
    ######################################################################

    def print_massif_line(self):
        s = 'n%d: %d ' % (len(self._children), self.bytes)
        if self.addr is not None:
            s += '%s: ' % self.addr
        s += self.func
        if self.source_file is not None:
            s += ' (in %s' % self.source_file
            if self.source_line is not None: s += ':%d' % self.source_line
            s += ')'
        return s
        
    def print_massif_tree(self, indent='', depth=-1):
        s = '%s%s' % (indent, self.print_massif_line())
        if depth == 0: return s
        for child in sorted(self._children, key=lambda c:-c.bytes):
            s += '\n' + child.print_massif_tree(indent+' ', depth-1)
        return s

    def __repr__(self):
        return '<HeapNode for %r: %s>' % (
            self.short_func, pymassif.util.pprint_size(self.bytes))

    def __str__(self):
        return self.print_massif_tree()

    def _matches(self, other):
        return (self.addr, self.func) == (other.addr, other.func)
    
    ######################################################################
    #{ Parsing
    ######################################################################
    
    @classmethod
    def parse(cls, s):
        """
        Parse a string containing a Heap Tree and return it as a tree
        of HeapNode objects.
        """
        s = s.rstrip()
        lines = s.split('\n')
        stack = [{'children': []}]
        for lineno, line in enumerate(lines):
            m = cls._HEAP_TREE_LINE_RE.match(line)
            if m is None:
                raise ValueError('Error parsing line %d of heap tree: %r' %
                                 (lineno, line))
            #if m.group('bytes') == '0':
            #    print 'Warning: zero byte allocation on line %d' % lineno
            indent = len(m.group('indent'))
            assert indent < len(stack)
            while indent < (len(stack)-1):
                node = cls._mk_heap_node(**stack.pop())
                stack[-1].setdefault('children',[]).append(node)
            stack.append( m.groupdict() )
        while len(stack)>1:
            node = cls._mk_heap_node(**stack.pop())
            stack[-1].setdefault('children',[]).append(node)
        assert len(stack[0]['children']) == 1
        heap_tree = stack[0]['children'][0]
        #assert heap_tree.print_massif_tree() == s
        return heap_tree

    ALLOCATION = 'Allocation'
    OTHER_CALLERS = 'Other callers (below threshold)'
    @classmethod
    def _mk_heap_node(cls, indent, num_children, bytes, addr,
                      func, children=None):
        """Helper for HeapTree()"""
        # Extract the source file & source line, if present.
        m = re.match('^(.*) \((\S+):(\d+)\)$', func)
        if m is None:
            m = re.match('^(.*) \(in (\S+)\)$', func)
            if m is None:
                source_file = source_line = None
            else:
                func, source_file = m.groups()
                source_line = None
        else:
            func, source_file, source_line = m.groups()
        # Normalize the function name
        if func == ('(heap allocation functions) '
                    'malloc/new/new[], --alloc-fns, etc.'):
            func = HeapNode.ALLOCATION
        if re.match('in \d+ places?, (all )?below massif.*', func):
            func = HeapNode.OTHER_CALLERS
        # Build the node.
        if children is not None:
            assert int(bytes) == sum(c.bytes for c in children)
            assert int(num_children) == len(children)
            return cls(addr, func, source_file, source_line, children=children)
        else:
            assert int(num_children) == 0
            return cls(addr, func, source_file, source_line, bytes=int(bytes))

    _HEAP_TREE_LINE_RE = re.compile(
        r'(?P<indent>\s*)n(?P<num_children>\d+): (?P<bytes>\d+) '
        r'((?P<addr>[0-9-zA-ZxX]+): )?'
        r'(?P<func>.+)')

