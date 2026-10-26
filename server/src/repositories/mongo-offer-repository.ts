import type { PipelineStage, QueryFilter } from 'mongoose';
import type { CategoryId } from '../domain/categories.js';
import { normalizeSearchText, type Offer } from '../domain/offer.js';
import type { StoreId } from '../domain/stores.js';
import { OfferModel, StoreStatusModel } from '../db/models.js';
import searchIndex from '../db/atlas-search-index.json' with { type: 'json' };
import { computeGroups } from '../domain/grouping.js';
import type {
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
  const filter: QueryFilter<Offer> = {
    $or: [{ validTo: { $exists: false } }, { validTo: { $gte: query.now } }],
  };
  if (query.stores?.length) filter.store = { $in: query.stores };
  if (query.category) filter.category = query.category;
  else if (query.excludeCategories?.length) filter.category = { $nin: query.excludeCategories };
  if (query.minDiscount !== undefined) filter.discountPercent = { $gte: query.minDiscount };
  if (query.ean) filter.eans = query.ean;
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
  const field = { unitPrice: '$unitPrice.amount', validTo: '$validTo' }[query.sort as string];
  if (!field) return undefined;
  const fallback = query.sort === 'validTo' ? new Date(LAST * 1000) : LAST;
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
    case 'relevance':
      if (query.text && mode === 'atlas') return { [SCORE]: -1, ...tiebreak };
      return { discountPercent: -1, ...tiebreak };
    case 'discount':
      return { discountPercent: -1, ...tiebreak };
  }
}

export function buildPipeline(query: OfferQuery, mode: SearchMode): PipelineStage[] {
  const pipeline: PipelineStage[] = [];
  const match = buildFilter(query);

  if (query.text) {
    if (mode === 'atlas') {
      pipeline.push({
        $search: {
          index: searchIndex.name,
          text: {
            query: query.text,
            path: SEARCHED_FIELDS,
            fuzzy: { maxEdits: 1, prefixLength: 2 },
          },
        },
      });
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
        best: { $first: '$ROOT' },
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
                $filter: { input: '$members', cond: { $ne: ['$this.id', '$best._id'] } },
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

export class MongoOfferRepository implements OfferRepository {
  constructor(private readonly searchMode: SearchMode) {}

  async find(query: OfferQuery): Promise<OfferPage> {
    const [result] = await OfferModel.aggregate<{ items: OfferDoc[]; total: { count: number }[] }>(
      buildPipeline(query, this.searchMode),
    );
    return {
      items: (result?.items ?? []).map(toView),
      total: result?.total[0]?.count ?? 0,
    };
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
    await StoreStatusModel.replaceOne({ store: status.store }, status, { upsert: true });
  }

  async storeStatuses(): Promise<StoreStatus[]> {
    return StoreStatusModel.find({}, { _id: 0 }).sort({ store: 1 }).lean<StoreStatus[]>();
  }
}
