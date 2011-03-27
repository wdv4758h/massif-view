# massif/util.py

"""
Utility functions used by pymassif.
"""

import os, shutil

_WEBSRC = os.path.join(os.path.split(__file__)[0],
                       '..', '..', 'websrc')

_GB = 1024. ** 3
_MB = 1024. ** 2
_KB = 1024.

def pprint_size(bytes):
    if bytes > _GB*100:
        return '%dGB' % (bytes/_GB)
    elif bytes > _GB*10:
        return '%.1fGB' % (bytes/_GB)
    elif bytes > _GB:
        return '%.2fGB' % (bytes/_GB)
    elif bytes > _MB*100:
        return '%dMB' % (bytes/_MB)
    elif bytes > _MB*10:
        return '%.1fMB' % (bytes/_MB)
    elif bytes > _MB:
        return '%.2fMB' % (bytes/_MB)
    elif bytes > _KB*100:
        return '%dkb' % (bytes/_KB)
    elif bytes > _KB*10:
        return '%.1fkb' % (bytes/_KB)
    elif bytes > _KB:
        return '%.2fkb' % (bytes/_KB)
    else:
        return '%db' % (bytes)

def load_websrc_file(name):
    src = os.path.join(_WEBSRC, name)
    return open(src, 'rb').read()

def copy_websrc_file(name, dst):
    src = os.path.join(_WEBSRC, name)
    shutil.copy(src, dst)
    
