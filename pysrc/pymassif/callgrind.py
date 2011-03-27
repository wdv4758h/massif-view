"""
Convert a massif heap tree to a callgrind-style output file, which can
be read in by GUIs such as kcachegrind.
"""

def print_callgrind(heap_tree):
    """
    Return a string containing a callgrind-style output file for the
    given massif heap tree.

    @type heap_tree: `pymassif.heap.HeapNode`
    @param heap_tree: The heap tre that should be displayed.
    """
    lines = []
    out = lines.append
    out(_CALLGRIND_HEADER % dict(total_bytes=heap_node.bytes)
    _print_callgrind_header(heap_tree, out)
    _print_callgrind(heap_tree, out)
    return '\n'.join(lines)

_CALLGRIND_HEADER = """\
version: 1
creator: pymassif
pid: N/A
cmd: N/A
part: 1
positions: line
events: Bytes
summary: %(total_bytes)s
fl=??
ob=??
"""

def _print_callgrind(heap_node, out):
    out('fn=%s' % _callgrind_fn(heap_node))
    if heap_node.is_leaf:
        out('%s %d' % (heap_node._uid, heap_node.bytes))
    else:
        for child in heap_node:
            if child.func == 'ALLOCATE':
                out('%s %d' % (child._uid, child.bytes))
            else:
                out('cfn=%s' % child._callgrind_fn())
                out('calls=1 %s' % child._uid)
                out('%s %d' % (heap_node._uid, child.bytes))
        for child in heap_node:
            if child.func != 'ALLOCATE':
                child._print_callgrind(out)

def _callgrind_fn(heap_node):
    #if heap_node.func == '...':
    #    return "Allocations Below Massif's Threshold"
    func = heap_node.func.split('(')[0]
    func = re.sub('<.*>', '', func)
    if True:
        return func
    else:
        return '%s (%d)' % (func, heap_node._uid)

