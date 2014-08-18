import sys
import os
import json
import csv

from glob import glob

sys.path.append(os.path.join(os.path.dirname(__file__), os.path.pardir))

from time import time

import logging
logging.basicConfig(format='%(asctime)s : %(levelname)s : %(message)s',
                    level=logging.INFO)

logger = logging.getLogger('log/hybrid_clustering.log')

import settings

from gensim import corpora, matutils
from gensim.corpora import dictionary
from gensim.models import ldamodel, lsimodel
from gensim.similarities import MatrixSimilarity

from sklearn.cluster import MiniBatchKMeans

import numpy as np
import pandas as pd

min_branching = 2
max_branching = int(sys.argv[1])
max_depth = int(sys.argv[2])
min_nodes = int(sys.argv[3])

fnames = glob(os.path.join(settings.PROC_DIR, '*.json'))
doc_ids = pd.Series(map(lambda x: os.path.basename(x).split('.')[0], fnames),
                    dtype=object)
unclustered_gensim_id = pd.Series(xrange(doc_ids.shape[0]))

matrix_sim_loc = os.path.join(settings.PERSIST_DIR,
                              'tfidf_corpus_lsi-200_matrix_similarity')

doc_topic = MatrixSimilarity.load(matrix_sim_loc).index


def cluster(group, level, nbranches):
    if len(group) < min_nodes:
        logger.info("......less than {min_nodes} nodes ({n})".format(
            min_nodes=min_nodes, n=len(group)))
        return

    mbk = MiniBatchKMeans(init='k-means++', n_clusters=nbranches, n_init=1,
                          init_size=1000, batch_size=1000)
    mbk.fit(doc_topic[group['original_id']])
    return mbk


def index_freq_above(na, minval):
    l = pd.Series(na)
    lvc = l.value_counts()
    logger.debug('all clusters found:\n'+lvc.to_string())
    logger.debug('filtered for size:\n'+lvc[lvc > minval].to_string())
    return l[l.isin(lvc[lvc > minval].index.values)].index

negs = pd.Series((-1 for i in xrange(doc_ids.shape[0])))

bookie = pd.DataFrame({
    'original_id': unclustered_gensim_id,
    'doc_id': doc_ids,
    'cluster_r0': negs.copy()
})


root_cluster_model = cluster(bookie, 'cluster_r0', 4)
root_cluster_labels = pd.Series(root_cluster_model.labels_)
bookie['cluster_r0'] = root_cluster_labels
logger.info('top-level clusters:\n'+str(root_cluster_labels.value_counts()))

for level in xrange(1, max_depth+1):
    level_name = 'cluster_r{n}'.format(n=level)
    bookie[level_name] = negs.copy()

for level in xrange(1, max_depth+1):
    this_level = 'cluster_r{n}'.format(n=level)
    prev_level = 'cluster_r{n}'.format(n=(level - 1))
    skip_groups = []
    logger.info('...clustering at level {n}'.format(n=level))
    for group_num, group in bookie[bookie[prev_level] >= 0].groupby(prev_level):
        _no_sig_clusters = False
        _small_group = False
        logger.info("......inside {pl}'s {nth} cluster ({l})".format(
            pl=prev_level, nth=group_num, l=group.shape[0]))
        _nbranches = max_branching
        while 1:
            cluster_model = cluster(group, this_level, _nbranches)
            if not cluster_model:
                _small_group = True
                break
            above_min = index_freq_above(cluster_model.labels_, min_nodes)
            if above_min.size == 0:
                _no_sig_clusters = True
                logger.info(
                    '.........no clusters of at least {mn} found'.format(
                        mn=min_nodes))
                _nbranches -= 1
                if _nbranches >= min_branching:
                    logger.info(
                        '.........trying again with {nb}'.format(
                            nb=_nbranches))
                    continue
                else:
                    break
            else:
                #_cluster_labels = pd.Series(cluster_model.labels_)
                #_cluster_centers = cluster_model.cluster_centers_
                _cluster_labels = pd.Series(-np.ones(cluster_model.labels_.size))
                _cluster_labels[above_min] = cluster_model.labels_[above_min.values]
                unique_labels = np.sort(np.unique(cluster_model.labels_[above_min.values]))
                _cluster_centers = cluster_model.cluster_centers_[unique_labels]
                break

        if _no_sig_clusters:
            logger.info('......no significant clusters found')
        elif _small_group:
            logger.info('......cluster too small, not dividing further')
            continue
        else:
            bookie.ix[group.index, this_level] = _cluster_labels.values
            vc = _cluster_labels.value_counts()
            logger.info(
                '\n'.join([
                           '......persisting the labels and centers for subclusters we found',
                           vc.to_string(),
                           '='*10,
                           str(_cluster_labels.value_counts().sum())]))

            # persistence filelocs
            lbl_filename = 'cluster_{prev_level}-{group}_labels_{nc}'.format(
                prev_level=(level-1), group=group_num, nc=_nbranches)
            lbl_loc = os.path.join(settings.PERSIST_DIR, lbl_filename)

            ctr_filename = 'cluster_{prev_level}-{group}_centers_{nc}'.format(
                prev_level=(level-1), group=group_num, nc=_nbranches)
            ctr_loc = os.path.join(settings.PERSIST_DIR, ctr_filename)

            #persist
            np.save(lbl_loc, _cluster_labels)
            np.save(ctr_loc, _cluster_centers)

    if (bookie[this_level] == -1).all():
        logger.info('...no subclusters at level {l}'.format(l=level))
        break

    table_filename = 'cluster_{parent}-{child}.csv'.format(parent=(level-1),
                                                           child=level)
    table_loc = os.path.join(settings.PERSIST_DIR, table_filename)
    _table = bookie[bookie[this_level] > -1][['doc_id', this_level]]
    _table.to_csv(table_loc, index=False)

bookie.to_csv(os.path.join(settings.PERSIST_DIR,
                           'cluster_bookeeping_kmeans.csv'),
              index=False)