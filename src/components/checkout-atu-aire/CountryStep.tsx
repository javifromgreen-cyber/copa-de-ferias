import { COUNTRIES } from "@/lib/checkout-atu-aire/countries";

/**
 * The very first question — an explicit, un-inferred country of purchase
 * (§4). Nothing else in the checkout can decide which package types are
 * even offered until this is answered, so it appears before the modality
 * cards themselves.
 */
export function CountryStep({ value, onSelect }: { value: string | null; onSelect: (countryCode: string) => void }) {
  return (
    <section aria-labelledby="country-heading" className="rounded-sm border border-carbon/15 bg-white p-5">
      <h2 id="country-heading" className="mb-3 text-lg font-semibold">
        ¿Desde qué país viajas?
      </h2>
      <select
        aria-label="País"
        value={value ?? ""}
        onChange={(e) => onSelect(e.target.value)}
        className="w-full max-w-sm rounded-sm border border-carbon/20 bg-white px-3 py-2 text-sm"
      >
        <option value="" disabled>
          Selecciona un país
        </option>
        {COUNTRIES.map((c) => (
          <option key={c.code} value={c.code}>
            {c.name}
          </option>
        ))}
      </select>
    </section>
  );
}
