import { isValidObjectId, type PipelineStage, type QueryFilter } from 'mongoose';
import type { CategoryId } from '../domain/categories.js';
import { normalizeSearchText, type Offer } from '../domain/offer.js';
import type { StoreId } from '../domain/stores.js';
import { OfferModel, StoreStatusModel } from '../db/models.js';
import searchIndex from '../db/atlas-search-index.json' with { type: 'json' };
import { computeGroups } from '../domain/grouping.js';
import { searchWords, type Vocabulary } from '../domain/spelling.js';
import type {
  CandidateQuery,
  OfferAlternative,
  OfferPage,
  OfferQuery,
  OfferRepository,
  OfferView,
  ReplaceResult,
  StoreStatus,
} from './offer-repository.js';

export type SearchMode = 'atlas' | 'basic';

const SEARCHED_FIELDS = ['productName', 'brand', 'sourceCategory'];

/** Filters shared by both search modes (everything except the text match). */
export function buildFilter(
  query: Omit<OfferQuery, 'sort' | 'page' | 'pageSize'>,
): QueryFilter<Offer> {
  const day = 86_400_000;
  const conditions: QueryFilter<Offer>[] = [
    // Not ended yet (the TTL index removes ended offers a day later).
    { $or: [{ validTo: { $exists: false } }, { validTo: { $gte: query.now } }] },
  ];
  if (!query.upcoming) {
    // Started already; next week's offers only on request.
    conditions.push({
      $or: [{ validFrom: { $exists: false } }, { validFrom: { $lte: query.now } }],
    });
  }
  if (query.startedWithinDays) {
    conditions.push({
      validFrom: {
        $gte: new Date(query.now.getTime() - query.startedWithinDays * day),
        $lte: query.now,
      },
    });
  }
  if (query.endsWithinDays) {
    conditions.push({
      validTo: {
        $gte: query.now,
        $lte: new Date(query.now.getTime() + query.endsWithinDays * day),
      },
    });
  }
  const filter: QueryFilter<Offer> = { $and: conditions };
  if (query.stores?.length) filter.store = { $in: query.stores };
  if (query.category) filter.category = query.category;
  else if (query.excludeCategories?.length) filter.category = { $nin: query.excludeCategories };
  if (query.minDiscount !== undefined) filter.discountPercent = { $gte: query.minDiscount };
  if (query.ean) filter.eans = query.ean;
  if (query.onlyDeals) filter.regular = { $ne: true };
  return filter;
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Basic mode: every word must appear in the diacritic-free searchText. */
export function buildTextFilter(text: string): QueryFilter<Offer> {
  const terms = normalizeSearchText(text).split(' ').filter(Boolean);
  return { $and: terms.map((term) => ({ searchText: { $regex: escapeRegex(term) } })) };
}

type SortSpec = Record<string, 1 | -1>;

/** Ascending sorts put missing values first in MongoDB; this field sorts them last instead. */
const SORT_KEY = '_sortKey';
/** Atlas Search relevance, copied into a field so it survives grouping. */
const SCORE = '_score';
const LAST = 1e12;

/** Optional fields used for ascending sorts, mapped to a `$addFields` stage that fills gaps. */
function sortKeyStage(query: OfferQuery): PipelineStage.AddFields | undefined {
  const field = { unitPrice: '$unitPrice.amount', validTo: '$validTo', newest: '$validFrom' }[
    query.sort as string
  ];
  if (!field) return undefined;
  // Missing values go last: far future for ascending dates, epoch for "newest" (descending).
  const fallback =
    query.sort === 'validTo' ? new Date(LAST * 1000) : query.sort === 'newest' ? new Date(0) : LAST;
  return { $addFields: { [SORT_KEY]: { $ifNull: [field, fallback] } } };
}

export function buildSort(query: OfferQuery, mode: SearchMode): SortSpec {
  const tiebreak = { _id: 1 } as const;
  switch (query.sort) {
    case 'price':
      return { price: 1, ...tiebreak };
    case 'unitPrice':
    case 'validTo':
      return { [SORT_KEY]: 1, ...tiebreak };
    case 'newest':
      return { [SORT_KEY]: -1, ...tiebreak };
    case 'relevance':
      if (query.text && mode === 'atlas') return { [SCORE]: -1, ...tiebreak };
      return { discountPercent: -1, ...tiebreak };
    case 'discount':
      return { discountPercent: -1, ...tiebreak };
  }
}

/**
 * One search word, matched in any searched field: the word itself (best in the product name), a
 * longer word starting with it ("jog" → "jogurt", "maslo" → "maslom"), or a different last letter
 * or two ("jajca" → "jajce", "mleko" → "mleka"). Misspellings are corrected before the search
 * (see SpellChecker), so there is no general fuzzy match: it also matched unrelated words one
 * letter away ("maslo" → "masso") and ranked the rarer ones first.
 */
function wordClause(word: string): Record<string, unknown> {
  const constant = { constant: { value: 1 } };
  const should: Record<string, unknown>[] = [
    { text: { query: word, path: 'productName', score: { boost: { value: 3 } } } },
    { text: { query: word, path: ['brand', 'sourceCategory'] } },
    {
      wildcard: {
        query: `${word}*`,
        path: SEARCHED_FIELDS,
        allowAnalyzedField: true,
        score: constant,
      },
    },
  ];
  if (word.length >= 4) {
    should.push({
      text: {
        query: word,
        path: SEARCHED_FIELDS,
        fuzzy: { maxEdits: 1, prefixLength: word.length - 1 },
        score: constant,
      },
    });
  }
  return { compound: { should, minimumShouldMatch: 1 } };
}

/** Atlas Search: every word must match; names with the words together rank higher. */
export function buildSearchStage(text: string): PipelineStage.Search {
  const words = searchWords(text);
  return {
    $search: {
      index: searchIndex.name,
      compound: {
        must: words.map(wordClause),
        ...(words.length > 1 && {
          should: [
            {
              phrase: {
                query: words.join(' '),
                path: 'productName',
                slop: 2,
                score: { boost: { value: 2 } },
              },
            },
          ],
        }),
      },
    },
  };
}

export function buildPipeline(query: OfferQuery, mode: SearchMode): PipelineStage[] {
  const pipeline: PipelineStage[] = [];
  const match = buildFilter(query);

  if (query.text) {
    if (mode === 'atlas') {
      pipeline.push(buildSearchStage(query.text));
    } else {
      Object.assign(match, buildTextFilter(query.text));
    }
  }

  pipeline.push({ $match: match });
  if (query.text && mode === 'atlas') {
    pipeline.push({ $addFields: { [SCORE]: { $meta: 'searchScore' } } });
  }
  const sortKey = sortKeyStage(query);
  if (sortKey) pipeline.push(sortKey);
  const sort = { $sort: buildSort(query, mode) } as PipelineStage.Sort;

  pipeline.push(
    sort,
    // One result per product: the best offer for this sort, the others as "also at".
    {
      $group: {
        _id: { $ifNull: ['$groupKey', '$_id'] },
        best: { $first: '$$ROOT' },
        members: {
          $push: {
            id: '$_id',
            store: '$store',
            productName: '$productName',
            price: '$price',
            unitPrice: '$unitPrice',
            condition: '$condition',
            sourceUrl: '$sourceUrl',
          },
        },
      },
    },
    {
      $replaceRoot: {
        newRoot: {
          $mergeObjects: [
            '$best',
            {
              alsoAt: {
                $filter: { input: '$members', cond: { $ne: ['$$this.id', '$best._id'] } },
              },
            },
          ],
        },
      },
    },
    sort,
    {
      $facet: {
        items: [
          { $skip: (query.page - 1) * query.pageSize },
          { $limit: query.pageSize },
          { $project: { searchText: 0, expiresAt: 0, groupKey: 0, [SORT_KEY]: 0, [SCORE]: 0 } },
        ],
        total: [{ $count: 'count' }],
      },
    },
  );
  return pipeline;
}

type AlternativeDoc = Omit<OfferAlternative, 'id'> & { id: { toString(): string } };
type OfferDoc = Omit<OfferView, 'id' | 'alsoAt'> & {
  _id: { toString(): string };
  alsoAt?: AlternativeDoc[];
};

function toView({ _id, alsoAt, ...rest }: OfferDoc): OfferView {
  return {
    id: _id.toString(),
    ...rest,
    ...(alsoAt?.length && { alsoAt: alsoAt.map((a) => ({ ...a, id: a.id.toString() })) }),
  };
}

/** The words change only with a refresh (once a day, from another process). */
const VOCABULARY_TTL_MS = 30 * 60_000;

export class MongoOfferRepository implements OfferRepository {
  private vocabularyCache: { at: number; words: Promise<Vocabulary> } | undefined;

  constructor(private readonly searchMode: SearchMode) {}

  vocabulary(): Promise<Vocabulary> {
    const cached = this.vocabularyCache;
    if (cached && Date.now() - cached.at < VOCABULARY_TTL_MS) return cached.words;
    const words = this.loadVocabulary();
    this.vocabularyCache = { at: Date.now(), words };
    // A failed load is retried on the next search.
    words.catch(() => {
      if (this.vocabularyCache?.words === words) this.vocabularyCache = undefined;
    });
    return words;
  }

  private async loadVocabulary(): Promise<Vocabulary> {
    const rows = await OfferModel.aggregate<{ _id: string; count: number }>([
      {
        $project: {
          _id: 0,
          words: { $regexFindAll: { input: '$searchText', regex: '[a-z0-9]+' } },
        },
      },
      { $project: { words: { $setUnion: ['$words.match'] } } },
      { $unwind: '$words' },
      { $group: { _id: '$words', count: { $sum: 1 } } },
    ]);
    return new Map(rows.map((row) => [row._id, row.count]));
  }

  async find(query: OfferQuery): Promise<OfferPage> {
    const [result] = await OfferModel.aggregate<{ items: OfferDoc[]; total: { count: number }[] }>(
      buildPipeline(query, this.searchMode),
    );
    return {
      items: (result?.items ?? []).map(toView),
      total: result?.total[0]?.count ?? 0,
    };
  }

  async findCandidates({
    text,
    stores,
    category,
    now,
    limit,
  }: CandidateQuery): Promise<OfferView[]> {
    // A plain word match on searchText, also with Atlas Search: the comparison needs every
    // product containing the words, not the best-scoring fuzzy matches.
    const docs = await OfferModel.find(
      {
        $and: [
          buildFilter({ now, ...(stores && { stores }), ...(category && { category }) }),
          buildTextFilter(text),
        ],
      },
      { searchText: 0, expiresAt: 0, groupKey: 0 },
    )
      .limit(limit)
      .lean<OfferDoc[]>();
    return docs.map(toView);
  }

  async findById(id: string): Promise<OfferView | undefined> {
    if (!isValidObjectId(id)) return undefined;
    const doc = await OfferModel.findById(id, {
      searchText: 0,
      expiresAt: 0,
      groupKey: 0,
    }).lean<OfferDoc | null>();
    return doc ? toView(doc) : undefined;
  }

  async productNames(category: CategoryId): Promise<string[]> {
    const docs = await OfferModel.find({ category }, { productName: 1, _id: 0 }).lean<
      { productName: string }[]
    >();
    return docs.map((d) => d.productName);
  }

  async categoryCounts(now: Date): Promise<{ category: CategoryId; count: number }[]> {
    const rows = await OfferModel.aggregate<{ _id: CategoryId; count: number }>([
      { $match: buildFilter({ now }) },
      { $group: { _id: '$category', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);
    return rows.map(({ _id, count }) => ({ category: _id, count }));
  }

  async replaceStoreOffers(
    store: StoreId,
    offers: Offer[],
    runStartedAt: Date,
  ): Promise<ReplaceResult> {
    if (offers.length > 0) {
      await OfferModel.bulkWrite(
        offers.map((offer) => ({
          replaceOne: {
            filter: { store, externalId: offer.externalId },
            replacement: offer,
            upsert: true,
          },
        })),
        { ordered: false },
      );
    }
    const { deletedCount } = await OfferModel.deleteMany({
      store,
      scrapedAt: { $lt: runStartedAt },
    });
    return { upserted: offers.length, removed: deletedCount };
  }

  async regroup(): Promise<number> {
    const docs = await OfferModel.find(
      {},
      { store: 1, productName: 1, price: 1, eans: 1, groupKey: 1 },
    ).lean<
      (Pick<Offer, 'store' | 'productName' | 'price' | 'eans' | 'groupKey'> & { _id: unknown })[]
    >();
    const groups = computeGroups(
      docs.map((d) => ({
        id: String(d._id),
        store: d.store,
        productName: d.productName,
        price: d.price,
        ...(d.eans && { eans: d.eans }),
      })),
    );
    const updates = docs.flatMap((d) => {
      const key = groups.get(String(d._id));
      if (key === d.groupKey) return [];
      return [
        {
          updateOne: {
            filter: { _id: d._id },
            update: key ? { $set: { groupKey: key } } : { $unset: { groupKey: 1 } },
          },
        },
      ];
    });
    if (updates.length > 0) await OfferModel.bulkWrite(updates, { ordered: false });
    return new Set(groups.values()).size;
  }

  async saveStoreStatus(status: StoreStatus): Promise<void> {
    // A failed run leaves lastSuccessAt as it was; a successful one clears the old error.
    await StoreStatusModel.updateOne(
      { store: status.store },
      {
        $set: { ...status, ...(status.ok && { lastSuccessAt: status.lastRunAt }) },
        ...(status.error === undefined && { $unset: { error: 1 } }),
      },
      { upsert: true },
    );
  }

  async storeStatuses(): Promise<StoreStatus[]> {
    return StoreStatusModel.find({}, { _id: 0 }).sort({ store: 1 }).lean<StoreStatus[]>();
  }
}
