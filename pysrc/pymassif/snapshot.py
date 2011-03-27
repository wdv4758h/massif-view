# massif/snapshot.py
"""
A data structure that encodes the contents of a single massif snapshot.
"""

import pymassif.util, pymassif.heap
import re

class Snapshot(object):
    """
    A single snapshot from a Massif output file.
    """
    def __init__(self, num, time, mem_heap, mem_heap_extra,
                 mem_stacks, heap_tree):
        self.num = num
        self.time = time
        self.mem_heap = mem_heap
        self.mem_heap_extra = mem_heap_extra
        self.mem_stacks = mem_stacks
        self.heap_tree = heap_tree

    _SNAPSHOT_RE = re.compile('\n'.join([
        r'#----+',
        r'snapshot=(?P<num>.*)',
        r'#----+',
        r'time=(?P<time>.*)',
        r'mem_heap_B=(?P<mem_heap>.*)',
        r'mem_heap_extra_B=(?P<mem_heap_extra>.*)',
        r'mem_stacks_B=(?P<mem_stacks>.*)',
        r'heap_tree=(?P<heap_tree_presence>.*)',
        r'(?P<heap_tree>(\s*n\d+: \d+ .*\n)*)']))

    _SNAPSHOT_TEMPLATE = '\n'.join([
        r'#-----------',
        r'snapshot=%(num)s',
        r'#-----------',
        r'time=%(time)s',
        r'mem_heap_B=%(mem_heap)s',
        r'mem_heap_extra_B=%(mem_heap_extra)s',
        r'mem_stacks_B=%(mem_stacks)s',
        r'heap_tree=%(heap_tree_presence)s'])

    @classmethod
    def parse(cls, s):
        """
        Given a string containing a snapshot, return a corresponding
        Snapshot object.
        """
        m = cls._SNAPSHOT_RE.match(s)
        if m is None:
            raise ValueError('Error parsing snapshot')
        return cls._parse(m)

    @classmethod
    def parse_all(cls, s):
        """
        Find all massif snapshots in a string, and return them as a
        list of Snapshot objects.
        """
        return [cls._parse(m) for m in cls._SNAPSHOT_RE.finditer(s)]

    @classmethod
    def parse_iter(cls, s):
        """
        Return an iterator that generates a Snapshot object for each
        massif snapshot in a given string.
        """
        return (cls._parse(m) for m in cls._SNAPSHOT_RE.finditer(s))

    @classmethod
    def _parse(cls, m):
        """Helper for parse_*() methods"""
        if m.group('heap_tree'):
            heap_tree = pymassif.heap.HeapTree(m.group('heap_tree'))
        else:
            heap_tree = None
        return cls(num=int(m.group('num')),
                   time=int(m.group('time')),
                   mem_heap=int(m.group('mem_heap')),
                   mem_heap_extra=int(m.group('mem_heap_extra')),
                   mem_stacks=int(m.group('mem_stacks')),
                   heap_tree=heap_tree)

    def __repr__(self):
        size = pymassif.util.pprint_size(self.mem_heap)
        return '<Snapshot %d (%s)>' % (self.num, size)

    def __str__(self):
        s = self._SNAPSHOT_TEMPLATE % dict(
            num=self.num, time=self.time, mem_heap=self.mem_heap,
            mem_heap_extra=self.mem_heap_extra, mem_stacks=self.mem_stacks,
            heap_tree_presence=(self.heap_tree is not None))
        if self.heap_tree is not None:
            s += '\n' + self.heap_tree.print_massif_tree()
        return s
    
