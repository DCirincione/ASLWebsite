"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";

import type { MerchCatalog, MerchFilterOption, MerchProduct, MerchVariant } from "@/lib/printful";

type MerchStorefrontProps = {
  catalog: MerchCatalog;
  purchasesEnabled: boolean;
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

type MerchCartItem = {
  productId: string;
  variantId: string;
  quantity: number;
};

type MerchCartDetail = MerchCartItem & {
  product: MerchProduct;
  variant: MerchVariant;
  lineTotal: number;
};

type MerchCheckoutStatus =
  | { type: "idle"; message?: undefined }
  | { type: "loading"; message: string }
  | { type: "error"; message: string };

const MERCH_CART_STORAGE_KEY = "asl-merch-cart-v2";

const toOptionId = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const toggleSelection = (current: string[], value: string) =>
  current.includes(value) ? current.filter((entry) => entry !== value) : [...current, value];

const formatCurrency = (amount: number, currencyCode: string) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currencyCode,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);

const formatCents = (amountCents: number, currencyCode: string) => formatCurrency(amountCents / 100, currencyCode);

const getCheckoutReadyVariants = (product: MerchProduct) =>
  product.variants.filter((variant) => variant.checkoutReady && variant.availability !== "discontinued");

const dedupeLabels = (values: Array<string | null | undefined>) =>
  [...new Set(values.map((value) => value?.trim()).filter(Boolean) as string[])];

const getProductGalleryImages = (product: MerchProduct | null | undefined) => {
  const gallery = Array.isArray(product?.imageUrls) ? product.imageUrls : [];
  if (gallery.length > 0) return gallery;
  return product?.imageUrl ? [product.imageUrl] : [];
};

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

const parseStoredCartItems = (value: string | null): MerchCartItem[] => {
  if (!value) return [];

  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];

    return parsed.flatMap((entry) => {
      if (!entry || typeof entry !== "object") return [];
      const item = entry as Partial<MerchCartItem>;
      const productId = typeof item.productId === "string" ? item.productId.trim() : "";
      const variantId = typeof item.variantId === "string" ? item.variantId.trim() : "";
      const quantity = typeof item.quantity === "number" && Number.isFinite(item.quantity) ? Math.max(1, Math.floor(item.quantity)) : 1;
      if (!productId || !variantId) return [];
      return [{ productId, variantId, quantity }];
    });
  } catch {
    return [];
  }
};

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

function ProductCard({
  product,
  purchasesEnabled,
  checkoutEnabled,
  checkoutStatusMessage,
  onOpenProduct,
}: {
  product: MerchProduct;
  purchasesEnabled: boolean;
  checkoutEnabled: boolean;
  checkoutStatusMessage: string | null;
  onOpenProduct: (product: MerchProduct) => void;
}) {
  const checkoutVariants = getCheckoutReadyVariants(product);
  const productImageUrls = getProductGalleryImages(product);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const activeImageUrl = productImageUrls[activeImageIndex] ?? productImageUrls[0] ?? null;
  const hasMultipleImages = productImageUrls.length > 1;

  const showPreviousImage = () => {
    if (!hasMultipleImages) return;
    setActiveImageIndex((current) => (current - 1 + productImageUrls.length) % productImageUrls.length);
  };

  const showNextImage = () => {
    if (!hasMultipleImages) return;
    setActiveImageIndex((current) => (current + 1) % productImageUrls.length);
  };

  return (
    <article className="merch-card">
      <div className={`merch-card__visual${activeImageUrl ? " merch-card__visual--image" : ""}`}>
        {activeImageUrl ? (
          <div className="merch-card__image-wrap">
            <Image
              src={activeImageUrl}
              alt={product.name}
              fill
              sizes="(max-width: 640px) 100vw, (max-width: 960px) 50vw, (max-width: 1200px) 33vw, 25vw"
              className="merch-card__image"
            />
          </div>
        ) : null}
        {hasMultipleImages ? (
          <>
            <div className="merch-card__gallery-controls">
              <button
                type="button"
                className="merch-card__gallery-button"
                onClick={showPreviousImage}
                aria-label={`Show previous ${product.name} mockup`}
              >
                ‹
              </button>
              <button
                type="button"
                className="merch-card__gallery-button"
                onClick={showNextImage}
                aria-label={`Show next ${product.name} mockup`}
              >
                ›
              </button>
            </div>
            <div className="merch-card__gallery-dots" aria-label={`${product.name} mockups`}>
              {productImageUrls.map((imageUrl, index) => (
                <button
                  key={imageUrl}
                  type="button"
                  className={`merch-card__gallery-dot${activeImageIndex === index ? " is-active" : ""}`}
                  onClick={() => setActiveImageIndex(index)}
                  aria-label={`Show ${product.name} mockup ${index + 1}`}
                  aria-pressed={activeImageIndex === index}
                />
              ))}
            </div>
          </>
        ) : null}
        <div className="merch-card__badges">
          <span className="merch-card__badge">{product.category}</span>
          {product.sport ? <span className="merch-card__badge merch-card__badge--muted">{product.sport}</span> : null}
        </div>
        {!activeImageUrl ? (
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

        {!purchasesEnabled ? (
          <span className="merch-card__cta merch-card__cta--disabled">
            Coming Soon
          </span>
        ) : checkoutEnabled && checkoutVariants.length > 0 ? (
          <button
            type="button"
            className="button primary merch-card__cta"
            onClick={() => onOpenProduct(product)}
          >
            View Details
          </button>
        ) : product.ctaUrl ? (
          <a className="button primary merch-card__cta" href={product.ctaUrl} target="_blank" rel="noreferrer">
            {product.ctaLabel}
          </a>
        ) : (
          <span className="merch-card__cta merch-card__cta--disabled">
            {checkoutStatusMessage || "Checkout Unavailable"}
          </span>
        )}
      </div>
    </article>
  );
}

function ProductOptionsDialog({
  product,
  purchasesEnabled,
  checkoutEnabled,
  checkoutStatusMessage,
  currencyCode,
  onAddToCart,
  onClose,
}: {
  product: MerchProduct | null;
  purchasesEnabled: boolean;
  checkoutEnabled: boolean;
  checkoutStatusMessage: string | null;
  currencyCode: string;
  onAddToCart: (product: MerchProduct, variant: MerchVariant) => void;
  onClose: () => void;
}) {
  const checkoutVariants = product ? getCheckoutReadyVariants(product) : [];
  const sizeOptions = product
    ? product.sizes.filter((size) => checkoutVariants.some((variant) => variant.size === size))
    : [];
  const colorOptions = product
    ? product.colors.filter((color) => checkoutVariants.some((variant) => variant.color === color))
    : [];
  const needsSizeChoice = sizeOptions.length > 1;
  const needsColorChoice = colorOptions.length > 1;
  const productImageUrls = getProductGalleryImages(product);
  const firstProductImageUrl = productImageUrls[0] ?? "";

  const [selectedSize, setSelectedSize] = useState<string>("");
  const [selectedColor, setSelectedColor] = useState<string>("");
  const [selectedImageUrl, setSelectedImageUrl] = useState<string>(firstProductImageUrl);

  useEffect(() => {
    if (!product) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [product, onClose]);

  useEffect(() => {
    if (!product) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [product]);

  if (!purchasesEnabled || !product) return null;

  const activeImageUrl = productImageUrls.includes(selectedImageUrl) ? selectedImageUrl : (firstProductImageUrl || null);

  const normalizedSelectedColor = colorOptions.includes(selectedColor) ? selectedColor : "";
  const provisionalSizeAvailability = sizeOptions.map((size) => ({
    label: size,
    disabled:
      !checkoutVariants.some(
        (variant) => variant.size === size && (!normalizedSelectedColor || variant.color === normalizedSelectedColor),
      ),
  }));
  const enabledSizes = provisionalSizeAvailability.filter((option) => !option.disabled).map((option) => option.label);
  const effectiveSelectedSize =
    selectedSize && enabledSizes.includes(selectedSize)
      ? selectedSize
      : enabledSizes.length === 1
        ? enabledSizes[0]
        : "";

  const provisionalColorAvailability = colorOptions.map((color) => ({
    label: color,
    disabled:
      !checkoutVariants.some(
        (variant) => variant.color === color && (!effectiveSelectedSize || variant.size === effectiveSelectedSize),
      ),
  }));
  const enabledColors = provisionalColorAvailability.filter((option) => !option.disabled).map((option) => option.label);
  const effectiveSelectedColor =
    selectedColor && enabledColors.includes(selectedColor)
      ? selectedColor
      : enabledColors.length === 1
        ? enabledColors[0]
        : "";

  const sizeAvailability = sizeOptions.map((size) => ({
    label: size,
    disabled:
      !checkoutVariants.some(
        (variant) => variant.size === size && (!effectiveSelectedColor || variant.color === effectiveSelectedColor),
      ),
  }));
  const colorAvailability = colorOptions.map((color) => ({
    label: color,
    disabled:
      !checkoutVariants.some(
        (variant) => variant.color === color && (!effectiveSelectedSize || variant.size === effectiveSelectedSize),
      ),
  }));

  const selectedVariant =
    needsSizeChoice && !effectiveSelectedSize
      ? null
      : needsColorChoice && !effectiveSelectedColor
        ? null
        : checkoutVariants.find(
            (variant) =>
              (!effectiveSelectedSize || variant.size === effectiveSelectedSize) &&
              (!effectiveSelectedColor || variant.color === effectiveSelectedColor),
          ) ?? (checkoutVariants.length === 1 ? checkoutVariants[0] : null);

  const canAddToCart = checkoutEnabled && Boolean(selectedVariant);
  const priceLabel =
    selectedVariant?.price != null
      ? formatCurrency(selectedVariant.price, currencyCode)
      : product.priceLabel;

  const handleAddToCart = () => {
    if (!selectedVariant) return;
    onAddToCart(product, selectedVariant);
    onClose();
  };

  return (
    <div className="merch-product-dialog" role="dialog" aria-modal="true" aria-labelledby="merch-product-dialog-title">
      <button type="button" className="merch-product-dialog__backdrop" onClick={onClose} aria-label="Close product details" />
      <div className="merch-product-dialog__panel">
        <button type="button" className="merch-product-dialog__close" onClick={onClose} aria-label="Close product details">
          ×
        </button>

        <div className="merch-product-dialog__layout">
          <div className="merch-product-dialog__visual">
            <div className="merch-product-dialog__stage">
              {activeImageUrl ? (
                <div className="merch-product-dialog__image-wrap">
                  <Image
                    src={activeImageUrl}
                    alt={product.name}
                    fill
                    sizes="(max-width: 900px) 100vw, 48vw"
                    className="merch-product-dialog__image"
                  />
                </div>
              ) : (
                <div className="merch-product-dialog__placeholder" aria-hidden="true">
                  <span>Aldrich Sports</span>
                  <strong>{product.category}</strong>
                </div>
              )}
            </div>

            {productImageUrls.length > 1 ? (
              <div className="merch-product-dialog__thumbnails" aria-label={`${product.name} mockups`}>
                {productImageUrls.map((imageUrl, index) => (
                  <button
                    key={imageUrl}
                    type="button"
                    className={`merch-product-dialog__thumbnail${activeImageUrl === imageUrl ? " is-active" : ""}`}
                    onClick={() => setSelectedImageUrl(imageUrl)}
                    aria-label={`View ${product.name} mockup ${index + 1}`}
                    aria-pressed={activeImageUrl === imageUrl}
                  >
                    <span className="merch-product-dialog__thumbnail-image-wrap">
                      <Image
                        src={imageUrl}
                        alt=""
                        fill
                        sizes="72px"
                        className="merch-product-dialog__thumbnail-image"
                      />
                    </span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <div className="merch-product-dialog__copy">
            <div className="merch-card__badges">
              <span className="merch-card__badge">{product.category}</span>
              {product.sport ? <span className="merch-card__badge merch-card__badge--muted">{product.sport}</span> : null}
            </div>

            <div className="merch-product-dialog__header">
              <h3 id="merch-product-dialog-title">{product.name}</h3>
              <p>{priceLabel}</p>
            </div>

            <p className="merch-product-dialog__description">{product.description}</p>

            {product.collections.length > 0 ? (
              <p className="merch-product-dialog__meta">
                <span>Collections</span>
                <strong>{product.collections.join(" • ")}</strong>
              </p>
            ) : null}

            {(sizeOptions.length > 0 || colorOptions.length > 0) ? (
              <div className="merch-product-dialog__options">
                {sizeOptions.length > 0 ? (
                  <label className="merch-card__option">
                    <span className="merch-card__option-label">Size</span>
                    <select
                      className="merch-card__option-select"
                      value={effectiveSelectedSize}
                      onChange={(event) => setSelectedSize(event.target.value)}
                      disabled={!checkoutEnabled || sizeOptions.length === 1}
                    >
                      {needsSizeChoice ? <option value="">Select size</option> : null}
                      {sizeAvailability.map((option) => (
                        <option key={option.label} value={option.label} disabled={option.disabled}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}

                {colorOptions.length > 0 ? (
                  <label className="merch-card__option">
                    <span className="merch-card__option-label">Color</span>
                    <select
                      className="merch-card__option-select"
                      value={effectiveSelectedColor}
                      onChange={(event) => setSelectedColor(event.target.value)}
                      disabled={!checkoutEnabled || colorOptions.length === 1}
                    >
                      {needsColorChoice ? <option value="">Select color</option> : null}
                      {colorAvailability.map((option) => (
                        <option key={option.label} value={option.label} disabled={option.disabled}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
              </div>
            ) : null}

            {checkoutEnabled ? (
              <button
                type="button"
                className={`button primary merch-card__cta${canAddToCart ? "" : " merch-card__cta--disabled-button"}`}
                onClick={handleAddToCart}
                disabled={!canAddToCart}
              >
                {selectedVariant ? "Add To Cart" : "Select Options"}
              </button>
            ) : product.ctaUrl ? (
              <a className="button primary merch-card__cta" href={product.ctaUrl} target="_blank" rel="noreferrer">
                {product.ctaLabel}
              </a>
            ) : (
              <span className="merch-card__cta merch-card__cta--disabled">
                {checkoutStatusMessage || "Checkout Unavailable"}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function CartDialog({
  isOpen,
  purchasesEnabled,
  cartDetails,
  cartItemCount,
  cartSubtotal,
  shippingFeeCents,
  cartTotal,
  currencyCode,
  shippingFeeLabel,
  checkoutEnabled,
  checkoutStatus,
  checkoutStatusMessage,
  onUpdateCartQuantity,
  onRemoveFromCart,
  onClearCart,
  onCheckout,
  onClose,
}: {
  isOpen: boolean;
  purchasesEnabled: boolean;
  cartDetails: MerchCartDetail[];
  cartItemCount: number;
  cartSubtotal: number;
  shippingFeeCents: number | null;
  cartTotal: number;
  currencyCode: string;
  shippingFeeLabel: string;
  checkoutEnabled: boolean;
  checkoutStatus: MerchCheckoutStatus;
  checkoutStatusMessage: string | null;
  onUpdateCartQuantity: (productId: string, variantId: string, nextQuantity: number) => void;
  onRemoveFromCart: (productId: string, variantId: string) => void;
  onClearCart: () => void;
  onCheckout: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  if (!purchasesEnabled || !isOpen) return null;

  return (
    <div className="merch-cart-dialog" role="dialog" aria-modal="true" aria-labelledby="merch-cart-dialog-title">
      <button type="button" className="merch-cart-dialog__backdrop" onClick={onClose} aria-label="Close cart" />
      <div className="merch-cart-dialog__panel">
        <button type="button" className="merch-cart-dialog__close" onClick={onClose} aria-label="Close cart">
          ×
        </button>

        <section className="merch-cart merch-cart--dialog" aria-label="Merch cart">
          <div className="merch-cart__header">
            <div className="merch-cart__header-copy">
              <p className="merch-results__eyebrow">Cart</p>
              <div className="merch-cart__header-row">
                <h3 id="merch-cart-dialog-title">Your Cart</h3>
                <span className="merch-cart__count-pill">
                  {cartItemCount} item{cartItemCount === 1 ? "" : "s"}
                </span>
              </div>
            </div>
            {cartDetails.length > 0 ? (
              <button type="button" className="button ghost merch-cart__clear" onClick={onClearCart}>
                Clear Cart
              </button>
            ) : null}
          </div>

          <div className="merch-cart__body">
            <div className="merch-cart__items-panel">
              {cartDetails.length > 0 ? (
                <div className="merch-cart__items">
                  {cartDetails.map((item) => (
                    <div key={`${item.product.id}:${item.variant.id}`} className="merch-cart__item">
                      <div className="merch-cart__item-overview">
                        <div className="merch-cart__item-media">
                          {item.product.imageUrl ? (
                            <Image
                              src={item.product.imageUrl}
                              alt={item.product.name}
                              fill
                              sizes="88px"
                              className="merch-cart__item-image"
                            />
                          ) : (
                            <span className="merch-cart__item-fallback" aria-hidden="true">
                              {item.product.category}
                            </span>
                          )}
                        </div>
                        <div className="merch-cart__item-copy">
                          <strong>{item.product.name}</strong>
                          <span>
                            {dedupeLabels([item.variant.size, item.variant.color]).join(" • ") || item.variant.name}
                          </span>
                        </div>
                      </div>

                      <div className="merch-cart__item-actions">
                        <div className="merch-cart__item-pricing">
                          <span>
                            {item.variant.price != null
                              ? `${formatCurrency(item.variant.price, currencyCode)} each`
                              : "Price varies"}
                          </span>
                          <strong>{formatCurrency(item.lineTotal, currencyCode)}</strong>
                        </div>
                        <div className="merch-cart__item-controls">
                          <div className="merch-cart__quantity" aria-label={`${item.product.name} quantity`}>
                            <button
                              type="button"
                              onClick={() => onUpdateCartQuantity(item.product.id, item.variant.id, item.quantity - 1)}
                              aria-label={`Decrease ${item.product.name} quantity`}
                            >
                              −
                            </button>
                            <span>{item.quantity}</span>
                            <button
                              type="button"
                              onClick={() => onUpdateCartQuantity(item.product.id, item.variant.id, item.quantity + 1)}
                              aria-label={`Increase ${item.product.name} quantity`}
                            >
                              +
                            </button>
                          </div>
                          <button
                            type="button"
                            className="merch-cart__remove"
                            onClick={() => onRemoveFromCart(item.product.id, item.variant.id)}
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="merch-cart__empty-state">
                  <p className="merch-cart__empty">Add products to your cart to start checkout.</p>
                  <span>Choose a product, pick your options, and it will show up here.</span>
                </div>
              )}
            </div>

            <div className="merch-cart__summary">
              <div className="merch-cart__summary-header">
                <p className="merch-results__eyebrow">Summary</p>
                <strong>Secure Square Checkout</strong>
              </div>

              <div className="merch-cart__totals">
                <div>
                  <span>Subtotal</span>
                  <strong>{formatCurrency(cartSubtotal, currencyCode)}</strong>
                </div>
                <div>
                  <span>{shippingFeeLabel}</span>
                  <strong>{shippingFeeCents != null ? formatCents(shippingFeeCents, currencyCode) : "Calculated at Checkout"}</strong>
                </div>
                <div className="merch-cart__total">
                  <span>Total</span>
                  <strong>{formatCurrency(cartTotal, currencyCode)}</strong>
                </div>
              </div>

              {checkoutStatus.type === "error" ? (
                <p className="merch-cart__status merch-cart__status--error">{checkoutStatus.message}</p>
              ) : null}
              {checkoutStatus.type === "loading" ? (
                <p className="merch-cart__status">{checkoutStatus.message}</p>
              ) : null}
              {!checkoutEnabled && checkoutStatusMessage ? (
                <p className="merch-cart__status merch-cart__status--error">{checkoutStatusMessage}</p>
              ) : null}
              {checkoutEnabled && shippingFeeCents == null ? (
                <p className="merch-cart__status">
                  Shipping is not being added from the site yet. Configure a flat Square shipping fee before going live.
                </p>
              ) : null}

              <button
                type="button"
                className="button primary merch-cart__checkout"
                onClick={onCheckout}
                disabled={!checkoutEnabled || cartDetails.length === 0 || checkoutStatus.type === "loading"}
              >
                {checkoutStatus.type === "loading" ? "Opening Checkout..." : "Checkout With Square"}
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

export function MerchStorefront({ catalog, purchasesEnabled }: MerchStorefrontProps) {
  const [activeCategory, setActiveCategory] = useState("all");
  const [activeProductId, setActiveProductId] = useState<string | null>(null);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [openFilterGroup, setOpenFilterGroup] = useState<FilterDropdownId | null>(null);
  const [selectedSportCollections, setSelectedSportCollections] = useState<string[]>([]);
  const [selectedGenderCollections, setSelectedGenderCollections] = useState<string[]>([]);
  const [selectedCollections, setSelectedCollections] = useState<string[]>([]);
  const [selectedSizes, setSelectedSizes] = useState<string[]>([]);
  const [selectedColors, setSelectedColors] = useState<string[]>([]);
  const [cartItems, setCartItems] = useState<MerchCartItem[]>([]);
  const [cartReady, setCartReady] = useState(false);
  const [checkoutStatus, setCheckoutStatus] = useState<MerchCheckoutStatus>({ type: "idle" });

  useEffect(() => {
    if (typeof window === "undefined") return;
    setCartItems(parseStoredCartItems(window.localStorage.getItem(MERCH_CART_STORAGE_KEY)));
    setCartReady(true);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !cartReady) return;
    window.localStorage.setItem(MERCH_CART_STORAGE_KEY, JSON.stringify(cartItems));
  }, [cartItems, cartReady]);

  useEffect(() => {
    setCartItems((current) =>
      current.flatMap((item) => {
        const product = catalog.products.find((entry) => entry.id === item.productId);
        const variant = product?.variants.find((entry) => entry.id === item.variantId);
        if (!product || !variant || !variant.checkoutReady || variant.availability === "discontinued") {
          return [];
        }

        return [{ ...item, quantity: Math.max(1, item.quantity) }];
      }),
    );
  }, [catalog.products]);

  useEffect(() => {
    if (purchasesEnabled) return;
    setActiveProductId(null);
    setIsCartOpen(false);
    setCheckoutStatus({ type: "idle" });
  }, [purchasesEnabled]);

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
  const activeProduct = activeProductId
    ? catalog.products.find((product) => product.id === activeProductId) ?? null
    : null;

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

  const cartDetails: MerchCartDetail[] = cartItems.flatMap((item) => {
    const product = catalog.products.find((entry) => entry.id === item.productId);
    const variant = product?.variants.find((entry) => entry.id === item.variantId);
    if (!product || !variant) return [];

    return [{
      ...item,
      product,
      variant,
      lineTotal: variant.price != null ? variant.price * item.quantity : 0,
    }];
  });

  const cartSubtotal = cartDetails.reduce((sum, item) => sum + item.lineTotal, 0);
  const cartItemCount = cartItems.reduce((sum, item) => sum + item.quantity, 0);
  const shippingFeeCents = cartItemCount > 0 ? catalog.checkout.shippingFeeCents : null;
  const shippingFee = shippingFeeCents != null ? shippingFeeCents / 100 : 0;
  const cartTotal = cartSubtotal + shippingFee;
  const checkoutEnabled = purchasesEnabled && catalog.checkout.enabled;
  const checkoutStatusMessage = purchasesEnabled
    ? catalog.checkout.statusMessage
    : "Merch purchases are coming soon.";
  const storefrontStatusMessage = purchasesEnabled
    ? catalog.statusMessage
    : "Merch purchases are coming soon. Browse the catalog now and check back later to order.";

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

  const addToCart = (product: MerchProduct, variant: MerchVariant) => {
    setCheckoutStatus({ type: "idle" });
    setCartItems((current) => {
      const existingItem = current.find(
        (entry) => entry.productId === product.id && entry.variantId === variant.id,
      );

      if (existingItem) {
        return current.map((entry) =>
          entry.productId === product.id && entry.variantId === variant.id
            ? { ...entry, quantity: entry.quantity + 1 }
            : entry,
        );
      }

      return [...current, { productId: product.id, variantId: variant.id, quantity: 1 }];
    });
  };

  const updateCartQuantity = (productId: string, variantId: string, nextQuantity: number) => {
    setCartItems((current) =>
      current.flatMap((item) => {
        if (item.productId !== productId || item.variantId !== variantId) return [item];
        if (nextQuantity <= 0) return [];
        return [{ ...item, quantity: nextQuantity }];
      }),
    );
  };

  const removeFromCart = (productId: string, variantId: string) => {
    setCartItems((current) =>
      current.filter((item) => !(item.productId === productId && item.variantId === variantId)),
    );
  };

  const clearCart = () => {
    setCartItems([]);
    setCheckoutStatus({ type: "idle" });
  };

  const closeProductDialog = () => setActiveProductId(null);
  const closeCartDialog = () => setIsCartOpen(false);

  const openCartDialog = () => {
    if (!purchasesEnabled) return;
    setActiveProductId(null);
    setOpenFilterGroup(null);
    setIsCartOpen(true);
  };

  const startCheckout = async () => {
    if (!checkoutEnabled || cartItems.length === 0) return;

    setCheckoutStatus({ type: "loading", message: "Opening secure Square checkout..." });

    try {
      const response = await fetch("/api/merch/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ items: cartItems }),
      });

      const json = (await response.json().catch(() => null)) as { checkoutUrl?: string; error?: string } | null;
      if (!response.ok || !json?.checkoutUrl) {
        throw new Error(json?.error ?? "Could not start the merch checkout.");
      }

      window.location.assign(json.checkoutUrl);
    } catch (error) {
      setCheckoutStatus({
        type: "error",
        message: error instanceof Error ? error.message : "Could not start the merch checkout.",
      });
    }
  };

  return (
    <div className="merch-storefront">
      <ProductOptionsDialog
        key={activeProduct?.id ?? "merch-dialog"}
        product={activeProduct}
        purchasesEnabled={purchasesEnabled}
        checkoutEnabled={checkoutEnabled}
        checkoutStatusMessage={checkoutStatusMessage}
        currencyCode={catalog.checkout.currencyCode}
        onAddToCart={addToCart}
        onClose={closeProductDialog}
      />
      <CartDialog
        isOpen={isCartOpen}
        purchasesEnabled={purchasesEnabled}
        cartDetails={cartDetails}
        cartItemCount={cartItemCount}
        cartSubtotal={cartSubtotal}
        shippingFeeCents={shippingFeeCents}
        cartTotal={cartTotal}
        currencyCode={catalog.checkout.currencyCode}
        shippingFeeLabel={catalog.checkout.shippingFeeLabel}
        checkoutEnabled={checkoutEnabled}
        checkoutStatus={checkoutStatus}
        checkoutStatusMessage={checkoutStatusMessage}
        onUpdateCartQuantity={updateCartQuantity}
        onRemoveFromCart={removeFromCart}
        onClearCart={clearCart}
        onCheckout={startCheckout}
        onClose={closeCartDialog}
      />
      {purchasesEnabled ? (
        <button
          type="button"
          className="merch-floating-cart"
          onClick={openCartDialog}
          aria-label={`Open cart${cartItemCount > 0 ? ` with ${cartItemCount} item${cartItemCount === 1 ? "" : "s"}` : ""}`}
        >
          <span className="merch-floating-cart__icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" role="presentation" focusable="false">
              <path
                d="M7 7h13l-1.5 8.5H9.2L7 7Zm0 0-.8-3H3"
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.8"
              />
              <circle cx="10" cy="19" r="1.5" fill="currentColor" />
              <circle cx="17" cy="19" r="1.5" fill="currentColor" />
            </svg>
          </span>
          <span className="sr-only">Cart</span>
          <span className="merch-floating-cart__count" aria-hidden="true">
            {cartItemCount}
          </span>
        </button>
      ) : null}

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
            {purchasesEnabled ? (
              <button type="button" className="button ghost merch-hero__cart-button" onClick={openCartDialog}>
                <span>View Cart</span>
                <span className="merch-hero__cart-count">
                  {cartItemCount}
                </span>
              </button>
            ) : null}
            {purchasesEnabled && catalog.storefrontUrl ? (
              <a className="button ghost" href={catalog.storefrontUrl} target="_blank" rel="noreferrer">
                Open Full Store
              </a>
            ) : null}
          </div>
        </div>
      </div>

      {storefrontStatusMessage ? (
        <div className={`merch-status merch-status--${catalog.source}`}>
          <p>{storefrontStatusMessage}</p>
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
            filteredProducts.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                purchasesEnabled={purchasesEnabled}
                checkoutEnabled={checkoutEnabled}
                checkoutStatusMessage={checkoutStatusMessage}
                onOpenProduct={(nextProduct) => {
                  if (!purchasesEnabled) return;
                  setIsCartOpen(false);
                  setActiveProductId(nextProduct.id);
                }}
              />
            ))
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
