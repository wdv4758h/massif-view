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
        self._func = FunctionName.parse(func)
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
            self.func, pymassif.util.pprint_size(self.bytes))

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

    ALLOCATION = 'Heap allocation (malloc/new/etc)'
    OTHER_CALLERS = 'Other callers (below threshold)'
    UNKNOWN_FUNC = '???'
    BELOW_MAIN = '(below main)'
    OTHER_ALLOCATIONS = 'Other Allocations'
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



class FunctionName(object):
    """
    A class used to parse a function name into its component piece.
    E.g., the function:

        void some_ns::SomeClass<A,B>::operator new(unsigned long)

    Would be divided into:

          rtype: void
        context: some_ns::SomeClass<A,B>
           name: operator new
           args: (unsigned long)

    Special names, such as \"(below main)\", are stored as the 'name'
    field and the remaining fields are left blank.
    """
    SPECIAL_FUNCTIONS = (HeapNode.ALLOCATION,
                         HeapNode.OTHER_CALLERS,
                         HeapNode.UNKNOWN_FUNC,
                         HeapNode.BELOW_MAIN,
                         HeapNode.OTHER_ALLOCATIONS)

    def __init__(self, rtype, context, name, template_args, args, qualifiers):
        self.rtype = rtype
        self.context = context
        self.name = name
        self.template_args = template_args
        self.args = args
        self.qualifiers = qualifiers
        if self.rtype:
            assert not re.search(r'\boperator\b', self.rtype)
        if self.context:
            assert not re.search(r'\boperator\b', self.context)

    def __repr__(self):
        raise ValueError('shoudl this really be called?')

    def __str__(self):
        s = ''
        if self.rtype: s += self.rtype+' '
        if self.context: s += self.context
        if self.name: s += self.name
        if self.template_args: s += self.template_args
        if self.args: s += self.args
        if self.qualifiers: s += ' '+self.qualifiers
        return s

    def __cmp__(self, other):
        return (cmp(self.__class__, other.__class__) or
                cmp(self.pieces(), other.pieces()))

    def __eq__(self, other):
        return (self.__class__ is other.__class__ and
                self.pieces()==other.pieces())

    def __ne__(self, other):
        return not self.__eq__(other)

    def __hash__(self):
        return hash(self.pieces())

    def pieces(self):
        """
        Return a tuple containing the pieces that make up the name of
        this function.  The tuple has the form:
        (rtype, context, name, template_args, args, qualifiers)
        """
        return (self.rtype, self.context, self.name,
                self.template_args, self.args, self.qualifiers)

    # anonymous namespace?
    _IDENTIFIER_RE = re.compile(r'^\w+$')
    _FUNC_RE = re.compile(r"""
        (?P<rtype>              ([^<>\(\)]    | <[^<>]*> )+  \s  )?
        (?P<context>          ( ([^<>\(\)\s:] | <[^<>]*> )+ ::)+ )?
        (?P<name>               ([^<>\(\)\s:]            )+      )
        (?P<template_args>                      <[^<>]*>         )?
        (?P<args>             \( [^\(\)]* \)                     )
        (?P<qualifiers>       (\s\w+)+                           )?
        $""", re.VERBOSE)

    @classmethod
    def _mangle_typecast_type(cls, m):
        s = m.group()
        s = s.replace('::', '@COLON@@COLON@')
        s = s.replace('<', '{').replace('>', '}')
        return s

    @classmethod
    def _mangle(cls, s):
        """
        Make various changes to the function name 's' that make it
        easier to parse with a regexp.  You can reverse these changes
        with _restore(s).
        """
        # Replace various 'operator xyz' function names, since they're
        # hard to parse.
        if 'operator' in s:
            s = re.sub(r'\b(operator ?)\(\)', r'\1@CALL@', s)
            s = re.sub(r'\b(operator ?)<<',   r'\1@LT@@LT@', s)
            s = re.sub(r'\b(operator ?)<',    r'\1@LT@', s) # also covers <=
            s = re.sub(r'\b(operator ?)>>',   r'\1@GT@@GT@', s)
            s = re.sub(r'\b(operator ?)>',    r'\1@GT@', s) # also covers >=
            s = re.sub(r'\b(operator ?)->',   r'\1-@GT@', s) # also covers ->*
            s = re.sub(r'\b(operator )',      r'operator@SPACE@', s)
            s = s.replace('@ ', '@@SPACE@') # eg space after operator<<.

            # type-cast operator:
            s = re.sub(r'\boperator@SPACE@\w[^\(]+\(',
                       cls._mangle_typecast_type, s)

        # WARNING: type casting operators that contain :: or <...> are
        # not handled yet.  E.g.: operator std::set<int>().

        # Replace "(anonymous namespace)" so we don't get confused by
        # the parenthases.
        s = s.replace('(anonymous namespace)', '@ANONYMOUS_NAMESPACE@')

        # Replace the '<' and '>' characters in nested template
        # argument lists with '{' and '}', respectively.  This makes
        # it possible to parse the function name using a single
        # regexp.  Use _restore_nested_templates() to restore the '{'
        # and '}' back to their original '<' and '>'.
        template_depth = [0]
        def subfunc(m):
            if m.group()=='<':
                template_depth[0]+=1
                if template_depth[0]>1: return '{'
            elif m.group()=='>':
                template_depth[0]-=1
                assert template_depth[0] >= 0
                if template_depth[0]>=1: return '}'
            return m.group()
        s = re.sub(r'[<>]|[^<>]+', subfunc, s)
        assert template_depth[0] == 0

        return s

    @classmethod
    def _restore(cls, s):
        """Undo the changes made by _mangle()."""
        if s is None: return None
        s = s.replace('{', '<').replace('}', '>')
        s = s.replace('@ANONYMOUS_NAMESPACE@', '(anonymous namespace)')
        s = s.replace('@CALL@', '()')
        s = s.replace('@SPACE@', ' ')
        s = s.replace('@LT@', '<')
        s = s.replace('@GT@', '>')
        s = s.replace('@COLON@', ':')
        return s

    x = set()
    @classmethod
    def parse(cls, function_string, verbose=False):
        # Is it a special function?
        for special in cls.SPECIAL_FUNCTIONS:
            if function_string.startswith(special):
                return cls(None, None, function_string, None, None, None)

        # Is it a bare function name without args (eg __libc_csu_init)?
        if cls._IDENTIFIER_RE.match(function_string):
            return cls(None, None, function_string, None, None, None)

        s = cls._mangle(function_string)
        m = cls._FUNC_RE.match(s)
        if not m:
            print 'Warning: unable to parse function name:'
            print '  %r' % function_string
            return cls(None, None, function_string, None, None, None)
            
            raise ValueError('Unable to parse: %r' % function_string)

        rtype = cls._restore(m.group('rtype'))
        context = cls._restore(m.group('context'))
        name = cls._restore(m.group('name'))
        template_args = cls._restore(m.group('template_args'))
        args = cls._restore(m.group('args'))
        qualifiers = cls._restore(m.group('qualifiers'))
        if rtype: rtype = rtype.strip()
        if qualifiers: qualifiers = qualifiers.strip()
        key = (rtype, context, name, template_args, args, qualifiers)
        if verbose and key not in cls.x:
            cls.x.add(key)
            print function_string
            if rtype:         print '         rtype: %s' % rtype
            if context:       print '       context: %s' % context
            if name:          print '          name: %s' % name
            if template_args: print ' template_args: %s' % template_args
            if args:          print '          args: %s' % args
            if qualifiers:    print '    qualifiers: %s' % qualifiers
            print
        return cls(rtype, context, name, template_args, args, qualifiers)



