# massif/html.py

"""
pymassif.html: Generate a webpage displaying the output of a massif
profiler run.
"""

if __name__ == '__main__':
    import sys
    sys.path.append('..')

import os, sys, re, math, random, time
from collections import defaultdict
from pymassif.heapseq import HeapSeq
from pymassif.heap import HeapNode
from pymassif.util import copy_websrc_file, load_websrc_file, pprint_size

MERGE_LINENOS = False
MERGE_OVERLOADS = False
MERGE_TEMPLATES = False

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
              'treemap_view.js', 'options.gif']:
        copy_websrc_file(f, os.path.join(outdir, f))

MASSIF_DATA_DEF = """
var massifData = new MassifData({
  times: [%(times)s],
  selectedTime: %(peak_time)s,
  heapSeq: %(heap_seq)s
  });
"""

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
    javascript = MASSIF_DATA_DEF % dict(
        times = ','.join(('%d' % t) for t in times),
        peak_time = times.index(heap_seq.peak_time),
        heap_seq = heap_seq.to_javascript(times, '  '))

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
    print 'Reading snapshots...'
    sshots = pymassif.snapshot.Snapshot.parse_all(massif_file)
    # Merge all the snapshot info into one data structure.
    print 'Merging snapshots...'
    heap_seq = pymassif.heapseq.HeapSeq(sshots)
    print 'Writing output...'
    node = write_html_output(heap_seq, 'test')
    

