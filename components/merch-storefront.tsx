"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";

import type { MerchCatalog, MerchFilterOption, MerchProduct } from "@/lib/printful";

type MerchStorefrontProps = {
  catalog: MerchCatalog;
};

type FilterState = {
  activeCategory: string;
  selectedSportCollections: string[];
  selectedGenderCollections: string[];
  selectedCollections: string[];
  selectedSizes: string[];
  selectedColors: string[];
};

type FilterGroupKey =
  | "activeCategory"
  | "selectedSportCollections"
  | "selectedGenderCollections"
  | "selectedCollections"
  | "selectedSizes"
  | "selectedColors";

type FilterDropdownId = "sports" | "gender" | "collection" | "sizes" | "colors";

const toOptionId = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const toggleSelection = (current: string[], value: string) =>
  current.includes(value) ? current.filter((entry) => entry !== value) : [...current, value];

const matchesSelectedFilters = (product: MerchProduct, selectedValues: string[], values: string[]) => {
  if (selectedValues.length === 0) return true;
  return values.some((value) => selectedValues.includes(toOptionId(value)));
};

const matchesCollectionKeys = (product: MerchProduct, selectedValues: string[]) => {
  if (selectedValues.length === 0) return true;
  return product.collectionKeys.some((collectionKey) => selectedValues.includes(collectionKey));
};

const productMatchesFilterState = (
  product: MerchProduct,
  filters: FilterState,
  skippedGroup?: FilterGroupKey,
) => {
  if (skippedGroup !== "activeCategory" && filters.activeCategory !== "all" && product.categoryKey !== filters.activeCategory) {
    return false;
  }

  if (
    skippedGroup !== "selectedSportCollections" &&
    !matchesCollectionKeys(product, filters.selectedSportCollections)
  ) {
    return false;
  }

  if (
    skippedGroup !== "selectedGenderCollections" &&
    !matchesCollectionKeys(product, filters.selectedGenderCollections)
  ) {
    return false;
  }

  if (
    skippedGroup !== "selectedCollections" &&
    !matchesCollectionKeys(product, filters.selectedCollections)
  ) {
    return false;
  }

  if (
    skippedGroup !== "selectedSizes" &&
    !matchesSelectedFilters(product, filters.selectedSizes, product.sizes)
  ) {
    return false;
  }

  if (
    skippedGroup !== "selectedColors" &&
    !matchesSelectedFilters(product, filters.selectedColors, product.colors)
  ) {
    return false;
  }

  return true;
};

const sportCollectionIds = new Set([
  "all-sports",
  "baseball",
  "basketball",
  "flag-football",
  "football",
  "golf",
  "mini-golf",
  "pickleball",
  "run-club",
  "soccer",
  "youth-soccer",
]);

const genderCollectionIds = new Set([
  "men-s",
  "mens",
  "women-s",
  "womens",
  "youth",
]);

const isSportCollectionOption = (option: MerchFilterOption) => sportCollectionIds.has(option.id);

const isGenderCollectionOption = (option: MerchFilterOption) =>
  genderCollectionIds.has(option.id) ||
  /\bmen'?s\b/i.test(option.label) ||
  /\bwomen'?s\b/i.test(option.label) ||
  /\byouth\b/i.test(option.label) ||
  /(^|-)mens($|-)/.test(option.id) ||
  /(^|-)womens($|-)/.test(option.id) ||
  /(^|-)men-s($|-)/.test(option.id) ||
  /(^|-)women-s($|-)/.test(option.id) ||
  /(^|-)youth($|-)/.test(option.id);

function FilterGroup({
  groupId,
  title,
  options,
  selected,
  isOpen,
  onToggleOpen,
  onToggle,
  availabilityById,
}: {
  groupId: FilterDropdownId;
  title: string;
  options: MerchFilterOption[];
  selected: string[];
  isOpen: boolean;
  onToggleOpen: (groupId: FilterDropdownId) => void;
  onToggle: (id: string) => void;
  availabilityById: Map<string, number>;
}) {
  if (options.length === 0) return null;

  return (
    <fieldset className="merch-filter-group">
      <button
        type="button"
        className="merch-filter-group__toggle"
        onClick={() => onToggleOpen(groupId)}
        aria-expanded={isOpen}
      >
        <span>{title}</span>
        <span className={`merch-filter-group__chevron${isOpen ? " is-open" : ""}`} aria-hidden>
          ˅
        </span>
      </button>
      {isOpen ? (
        <div className="merch-filter-group__options">
          {options.map((option) => {
            const isSelected = selected.includes(option.id);
            const availableCount = availabilityById.get(option.id) ?? 0;
            const isDisabled = !isSelected && availableCount === 0;

            return (
              <label
                key={option.id}
                className={`merch-filter-option${isDisabled ? " is-disabled" : ""}`}
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  disabled={isDisabled}
                  onChange={() => onToggle(option.id)}
                />
                <span className="merch-filter-option__text">{option.label}</span>
                <span className="merch-filter-option__count">{availableCount}</span>
              </label>
            );
          })}
        </div>
      ) : null}
    </fieldset>
  );
}

function ProductCard({ product }: { product: MerchProduct }) {
  return (
    <article className="merch-card">
      <div className={`merch-card__visual${product.imageUrl ? " merch-card__visual--image" : ""}`}>
        {product.imageUrl ? (
          <div className="merch-card__image-wrap">
            <Image
              src={product.imageUrl}
              alt={product.name}
              fill
              sizes="(max-width: 640px) 100vw, (max-width: 960px) 50vw, (max-width: 1200px) 33vw, 25vw"
              className="merch-card__image"
            />
          </div>
        ) : null}
        <div className="merch-card__badges">
          <span className="merch-card__badge">{product.category}</span>
          {product.sport ? <span className="merch-card__badge merch-card__badge--muted">{product.sport}</span> : null}
        </div>
        {!product.imageUrl ? (
          <div className="merch-card__placeholder" aria-hidden="true">
            <span>Aldrich Sports</span>
            <strong>{product.category}</strong>
          </div>
        ) : null}
      </div>

      <div className="merch-card__body">
        <div className="merch-card__copy">
          <div className="merch-card__title-row">
            <h3>{product.name}</h3>
            <p className="merch-card__price">{product.priceLabel}</p>
          </div>
        </div>

        {product.ctaUrl ? (
          <a className="button primary merch-card__cta" href={product.ctaUrl} target="_blank" rel="noreferrer">
            {product.ctaLabel}
          </a>
        ) : (
          <span className="merch-card__cta merch-card__cta--disabled">Available Soon</span>
        )}
      </div>
    </article>
  );
}

export function MerchStorefront({ catalog }: MerchStorefrontProps) {
  const [activeCategory, setActiveCategory] = useState("all");
  const [openFilterGroup, setOpenFilterGroup] = useState<FilterDropdownId | null>(null);
  const [selectedSportCollections, setSelectedSportCollections] = useState<string[]>([]);
  const [selectedGenderCollections, setSelectedGenderCollections] = useState<string[]>([]);
  const [selectedCollections, setSelectedCollections] = useState<string[]>([]);
  const [selectedSizes, setSelectedSizes] = useState<string[]>([]);
  const [selectedColors, setSelectedColors] = useState<string[]>([]);

  const categoryCards = [
    {
      id: "all",
      label: "Shop All",
      count: catalog.products.length,
      preview: catalog.products[0] ?? null,
    },
    ...catalog.filters.categories.map((option) => ({
      ...option,
      preview: catalog.products.find((product) => product.categoryKey === option.id) ?? null,
    })),
  ];

  const groupedSportCollections = catalog.filters.collections.filter(
    (option) => isSportCollectionOption(option) && option.id !== "all-sports",
  );
  const groupedGenderCollections = catalog.filters.collections.filter((option) => isGenderCollectionOption(option));
  const groupedStandardCollections = catalog.filters.collections.filter(
    (option) => !isSportCollectionOption(option) && !isGenderCollectionOption(option),
  );

  const filterState: FilterState = {
    activeCategory,
    selectedSportCollections,
    selectedGenderCollections,
    selectedCollections,
    selectedSizes,
    selectedColors,
  };

  const filteredProducts = catalog.products.filter((product) => productMatchesFilterState(product, filterState));

  const categoryAvailability = new Map(
    categoryCards.map((category) => [
      category.id,
      catalog.products.filter(
        (product) =>
          productMatchesFilterState(product, filterState, "activeCategory") &&
          (category.id === "all" || product.categoryKey === category.id),
      ).length,
    ]),
  );

  const buildAvailabilityMap = (
    options: MerchFilterOption[],
    groupKey: FilterGroupKey,
    matchesOption: (product: MerchProduct, optionId: string) => boolean,
  ) =>
    new Map(
      options.map((option) => [
        option.id,
        catalog.products.filter(
          (product) => productMatchesFilterState(product, filterState, groupKey) && matchesOption(product, option.id),
        ).length,
      ]),
    );

  const sportAvailability = buildAvailabilityMap(
    groupedSportCollections,
    "selectedSportCollections",
    (product, optionId) => product.collectionKeys.includes(optionId),
  );
  const genderAvailability = buildAvailabilityMap(
    groupedGenderCollections,
    "selectedGenderCollections",
    (product, optionId) => product.collectionKeys.includes(optionId),
  );
  const collectionAvailability = buildAvailabilityMap(
    groupedStandardCollections,
    "selectedCollections",
    (product, optionId) => product.collectionKeys.includes(optionId),
  );
  const sizeAvailability = buildAvailabilityMap(
    catalog.filters.sizes,
    "selectedSizes",
    (product, optionId) => product.sizes.some((size) => toOptionId(size) === optionId),
  );
  const colorAvailability = buildAvailabilityMap(
    catalog.filters.colors,
    "selectedColors",
    (product, optionId) => product.colors.some((color) => toOptionId(color) === optionId),
  );

  const activeFilterChips = [
    ...(activeCategory !== "all"
      ? [
          {
            id: `category:${activeCategory}`,
            label: `Category: ${categoryCards.find((card) => card.id === activeCategory)?.label ?? activeCategory}`,
            onRemove: () => setActiveCategory("all"),
          },
        ]
      : []),
    ...groupedSportCollections
      .filter((option) => selectedSportCollections.includes(option.id))
      .map((option) => ({
        id: `sport:${option.id}`,
        label: `Sport: ${option.label}`,
        onRemove: () => setSelectedSportCollections((current) => current.filter((entry) => entry !== option.id)),
      })),
    ...groupedGenderCollections
      .filter((option) => selectedGenderCollections.includes(option.id))
      .map((option) => ({
        id: `gender:${option.id}`,
        label: `Gender: ${option.label}`,
        onRemove: () => setSelectedGenderCollections((current) => current.filter((entry) => entry !== option.id)),
      })),
    ...groupedStandardCollections
      .filter((option) => selectedCollections.includes(option.id))
      .map((option) => ({
        id: `collection:${option.id}`,
        label: `Collection: ${option.label}`,
        onRemove: () => setSelectedCollections((current) => current.filter((entry) => entry !== option.id)),
      })),
    ...catalog.filters.sizes
      .filter((option) => selectedSizes.includes(option.id))
      .map((option) => ({
        id: `size:${option.id}`,
        label: `Size: ${option.label}`,
        onRemove: () => setSelectedSizes((current) => current.filter((entry) => entry !== option.id)),
      })),
    ...catalog.filters.colors
      .filter((option) => selectedColors.includes(option.id))
      .map((option) => ({
        id: `color:${option.id}`,
        label: `Color: ${option.label}`,
        onRemove: () => setSelectedColors((current) => current.filter((entry) => entry !== option.id)),
      })),
  ];

  const hasActiveFilters =
    activeCategory !== "all" ||
    selectedSportCollections.length > 0 ||
    selectedGenderCollections.length > 0 ||
    selectedCollections.length > 0 ||
    selectedSizes.length > 0 ||
    selectedColors.length > 0;

  const clearFilters = () => {
    setActiveCategory("all");
    setSelectedSportCollections([]);
    setSelectedGenderCollections([]);
    setSelectedCollections([]);
    setSelectedSizes([]);
    setSelectedColors([]);
  };

  const toggleFilterGroup = (groupId: FilterDropdownId) => {
    setOpenFilterGroup((current) => (current === groupId ? null : groupId));
  };

  return (
    <div className="merch-storefront">
      <div className="merch-hero">
        <div className="merch-hero__copy">
          <p className="merch-hero__eyebrow">Merch</p>
          <h1>Merchandise</h1>
          <p className="merch-hero__lede">
            Shop Aldrich Sports gear built for gameday, travel days, and everyday wear.
            The page is wired so product filters can be derived from your Printful catalog once the store is connected.
          </p>
          <div className="merch-hero__actions">
            <Link className="button primary" href="#merch-catalog-start">
              Shop The Collection
            </Link>
            {catalog.storefrontUrl ? (
              <a className="button ghost" href={catalog.storefrontUrl} target="_blank" rel="noreferrer">
                Open Full Store
              </a>
            ) : null}
          </div>
        </div>
      </div>

      {catalog.statusMessage ? (
        <div className={`merch-status merch-status--${catalog.source}`}>
          <p>{catalog.statusMessage}</p>
        </div>
      ) : null}

      <div id="merch-catalog-start" className="merch-anchor" aria-hidden="true" />

      {catalog.products.length > 0 ? (
        <div className="merch-category-strip" aria-label="Merch categories">
          {categoryCards.map((category) => {
            const availableCount = categoryAvailability.get(category.id) ?? 0;
            const isDisabled = category.id !== activeCategory && availableCount === 0;
            const previewStyle = category.preview?.imageUrl
              ? {
                  backgroundImage: `linear-gradient(180deg, rgba(10, 18, 32, 0.28), rgba(10, 18, 32, 0.58)), url("${category.preview.imageUrl}")`,
                }
              : undefined;

            return (
              <button
                key={category.id}
                type="button"
                className={`merch-category-card${activeCategory === category.id ? " is-active" : ""}${isDisabled ? " is-disabled" : ""}`}
                onClick={() => setActiveCategory(category.id)}
                disabled={isDisabled}
              >
                <span className="merch-category-card__media" style={previewStyle}>
                  {!category.preview?.imageUrl ? (
                    <span className="merch-category-card__fallback" aria-hidden="true">
                      {category.label}
                    </span>
                  ) : null}
                </span>
                <span className="merch-category-card__copy">
                  <strong>{category.label}</strong>
                  <span>{availableCount} item{availableCount === 1 ? "" : "s"}</span>
                </span>
              </button>
            );
          })}
        </div>
      ) : null}

      <section className="merch-results" id="merch-shop" aria-labelledby="merch-shop-title">
        <div className="merch-results__header">
          <div>
            <p className="merch-results__eyebrow">Catalog</p>
            <h2 id="merch-shop-title">Shop All</h2>
            <p className="merch-results__summary">
              Showing {filteredProducts.length} of {catalog.products.length} items.
            </p>
          </div>
          <div className="merch-results__actions">
            {activeFilterChips.length > 0 ? (
              <div className="merch-results__active-filters" aria-label="Active filters">
                {activeFilterChips.map((chip) => (
                  <button
                    key={chip.id}
                    type="button"
                    className="merch-results__filter-chip"
                    onClick={chip.onRemove}
                  >
                    <span>{chip.label}</span>
                    <span aria-hidden>×</span>
                  </button>
                ))}
              </div>
            ) : null}
            {hasActiveFilters ? (
              <button type="button" className="button ghost merch-results__clear" onClick={clearFilters}>
                Clear Filters
              </button>
            ) : null}
          </div>
        </div>

        <div className="merch-results__toolbar">
          <aside className="merch-filters" id="merch-filters" aria-label="Merch filters">
            <FilterGroup
              groupId="sports"
              title="All Sports"
              options={groupedSportCollections}
              selected={selectedSportCollections}
              isOpen={openFilterGroup === "sports"}
              onToggleOpen={toggleFilterGroup}
              onToggle={(id) => setSelectedSportCollections((current) => toggleSelection(current, id))}
              availabilityById={sportAvailability}
            />
            <FilterGroup
              groupId="gender"
              title="Gender"
              options={groupedGenderCollections}
              selected={selectedGenderCollections}
              isOpen={openFilterGroup === "gender"}
              onToggleOpen={toggleFilterGroup}
              onToggle={(id) => setSelectedGenderCollections((current) => toggleSelection(current, id))}
              availabilityById={genderAvailability}
            />
            <FilterGroup
              groupId="collection"
              title="Collection"
              options={groupedStandardCollections}
              selected={selectedCollections}
              isOpen={openFilterGroup === "collection"}
              onToggleOpen={toggleFilterGroup}
              onToggle={(id) => setSelectedCollections((current) => toggleSelection(current, id))}
              availabilityById={collectionAvailability}
            />
            <FilterGroup
              groupId="sizes"
              title="Sizing"
              options={catalog.filters.sizes}
              selected={selectedSizes}
              isOpen={openFilterGroup === "sizes"}
              onToggleOpen={toggleFilterGroup}
              onToggle={(id) => setSelectedSizes((current) => toggleSelection(current, id))}
              availabilityById={sizeAvailability}
            />
            <FilterGroup
              groupId="colors"
              title="Color"
              options={catalog.filters.colors}
              selected={selectedColors}
              isOpen={openFilterGroup === "colors"}
              onToggleOpen={toggleFilterGroup}
              onToggle={(id) => setSelectedColors((current) => toggleSelection(current, id))}
              availabilityById={colorAvailability}
            />
          </aside>
        </div>

        <div className="merch-grid" aria-live="polite">
          {filteredProducts.length > 0 ? (
            filteredProducts.map((product) => <ProductCard key={product.id} product={product} />)
          ) : (
            <div className="merch-empty-state">
              <h3>{catalog.products.length === 0 ? "No merch is live yet." : "No products match that filter combination."}</h3>
              <p>
                {catalog.products.length === 0
                  ? "Once products are added in Printful, they will populate here automatically."
                  : "Try clearing one or two filters to widen the catalog."}
              </p>
              {catalog.products.length > 0 ? (
                <button type="button" className="button primary" onClick={clearFilters}>
                  Reset Filters
                </button>
              ) : null}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
