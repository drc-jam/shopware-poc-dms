import { describe, expect, it } from "vitest";
import index from "@/data/fitment-index.json";
import { allowedProductIds, fitStatus, fitmentRows, parseGarage, parseVehicle, vehicleTree, GARAGE_MAX } from "./fitment";

const idx = index as unknown as { byProduct: Record<string, string[]>; universal: string[]; byVehicleYear: Record<string, string[]> };
const V = "CHE-MALIBU-1978-1983|1980";

describe("fitment (app side)", () => {
  it("accepts only known vehicle keys within their year range", () => {
    expect(parseVehicle(V)?.label).toBe("1980 Chevrolet Malibu");
    expect(parseVehicle("CHE-MALIBU-1978-1983|1977")).toBeNull();
    expect(parseVehicle("NOT-A-VEHICLE|1980")).toBeNull();
    expect(parseVehicle("che-malibu-1978-1983|1980")).toBeNull();
    expect(parseVehicle(`${V}<script>`)).toBeNull();
  });

  it("keeps at most 3 distinct valid garage entries (newest last)", () => {
    const g = parseGarage(`JUNK|1,${V},${V},CHE-CAMARO-1970-1981|1975,CHE-CHEVELLE-1964-1972|1970,CHE-MALIBU-1978-1983|1983`);
    expect(g).toHaveLength(GARAGE_MAX);
    expect(g.map((v) => v.id)).toEqual(["CHE-CAMARO-1970-1981|1975", "CHE-CHEVELLE-1964-1972|1970", "CHE-MALIBU-1978-1983|1983"]);
  });

  it("allows fitting parts for the model year plus universal parts", () => {
    const v = parseVehicle(V)!;
    const ids = allowedProductIds(v);
    expect(ids).toEqual(expect.arrayContaining([...idx.byVehicleYear[V]!, ...idx.universal]));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("classifies fit status", () => {
    const v = parseVehicle(V)!;
    const fits = idx.byVehicleYear[V]![0]!;
    const noFit = Object.entries(idx.byProduct).find(([, keys]) => !keys.includes("CHE-MALIBU-1978-1983"))![0];
    expect(fitStatus(fits, v)).toBe("fits");
    expect(fitStatus(noFit, v)).toBe("no-fit");
    expect(fitStatus(idx.universal[0]!, v)).toBe("universal");
    expect(fitStatus(fits, null)).toBe("unknown");
    expect(fitmentRows(fits).length).toBe(idx.byProduct[fits]!.length);
  });

  it("builds a dependent make → model → year tree", () => {
    const t = vehicleTree();
    const chevy = t.makes.find((m) => m.make === "Chevrolet")!;
    const malibu = chevy.models.find((m) => m.key === "CHE-MALIBU-1978-1983")!;
    expect(malibu.years[0]).toBe(1983);
    expect(malibu.years.at(-1)).toBe(1978);
  });
});
