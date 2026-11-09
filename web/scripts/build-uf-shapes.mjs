// Builds src/data/uf-shapes.json: the 27 UFs as SVG paths, ready to draw.
//
// Source: IBGE, API de malhas v3, Brasil por UF, malha de 2022, qualidade intermediária
// (TopoJSON), and API de localidades for the UF abbreviations. Run once when the mesh
// changes:  npm run shapes
//
// Steps: simplify the topology (shared borders stay shared, so no gaps appear between UFs),
// project with an Albers equal-area conic tuned for Brazil (areas comparable, which a
// choropleth needs), and write integer, relative paths to keep the file small.
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { geoConicEqualArea, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import { presimplify, simplify } from "topojson-simplify";

const IBGE = "https://servicodados.ibge.gov.br/api";
const MESH_URL = `${IBGE}/v3/malhas/paises/BR?periodo=2022&intrarregiao=UF&qualidade=intermediaria&formato=application/json`;
const STATES_URL = `${IBGE}/v1/localidades/estados`;
const SIZE = 600;
const MARGIN = 8;
const MIN_WEIGHT = 0.005; // planar triangle area below which a point is dropped (visually lossless at 600 px)
const OUTPUT = fileURLToPath(new URL("../src/data/uf-shapes.json", import.meta.url));

async function getJson(url) {
  const response = await fetch(url, { headers: { "User-Agent": "rural-credit-analysis/build-uf-shapes" } });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response.json();
}

// Absolute integer path "M x,y L x,y ... Z" -> rings of points, without repeated points.
function rings(d) {
  const result = [];
  for (const [, command, numbers] of d.matchAll(/([MLZ])([^MLZ]*)/g)) {
    if (command === "Z") continue;
    const point = numbers.split(",").map(Number);
    if (command === "M") result.push([point]);
    else {
      const ring = result[result.length - 1];
      const last = ring[ring.length - 1];
      if (point[0] !== last[0] || point[1] !== last[1]) ring.push(point);
    }
  }
  // Islands smaller than a pixel collapse to one or two points: they draw nothing but would
  // stretch the bounding box (Fernando de Noronha), so they are left out.
  return result.filter((ring) => ring.length >= 3);
}

// Rings -> relative path (same drawing, smaller file).
function toPath(kept) {
  return kept
    .map((ring) => {
      let [x, y] = ring[0];
      let out = `M${x} ${y}`;
      for (const [nx, ny] of ring.slice(1)) {
        const dx = nx - x;
        const dy = ny - y;
        out += `l${dx}${dy < 0 ? "" : " "}${dy}`;
        x = nx;
        y = ny;
      }
      return `${out}z`;
    })
    .join("");
}

const [topology, states] = await Promise.all([getJson(MESH_URL), getJson(STATES_URL)]);
const byCode = new Map(states.map((state) => [String(state.id), state]));
const objectName = Object.keys(topology.objects)[0];
const simplified = simplify(presimplify(topology), MIN_WEIGHT);
const collection = feature(simplified, simplified.objects[objectName]);

const projection = geoConicEqualArea()
  .parallels([-2, -22])
  .rotate([54, 0])
  .fitExtent([[MARGIN, MARGIN], [SIZE - MARGIN, SIZE - MARGIN]], collection);
const path = geoPath(projection).digits(0);

const bounds = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
const ufs = collection.features
  .map((item) => {
    const state = byCode.get(String(item.properties.codarea));
    if (!state) throw new Error(`UF code ${item.properties.codarea} not found in the localidades API`);
    const kept = rings(path(item));
    for (const [x, y] of kept.flat()) {
      bounds.x0 = Math.min(bounds.x0, x);
      bounds.y0 = Math.min(bounds.y0, y);
      bounds.x1 = Math.max(bounds.x1, x);
      bounds.y1 = Math.max(bounds.y1, y);
    }
    const [cx, cy] = path.centroid(item).map(Math.round);
    return { uf: state.sigla, name: state.nome, region: state.regiao.nome, d: toPath(kept), cx, cy };
  })
  .sort((a, b) => a.uf.localeCompare(b.uf));

if (ufs.length !== 27) throw new Error(`expected 27 UFs, got ${ufs.length}`);

// Bounding box of the drawing, so the SVG viewBox wraps the country without empty margins.
const viewBox = [bounds.x0 - 2, bounds.y0 - 2, bounds.x1 - bounds.x0 + 4, bounds.y1 - bounds.y0 + 4];

const output = {
  source: "IBGE, API de malhas v3 (malha de 2022, UF, qualidade intermediária) e API de localidades",
  projection: "Cônica equivalente de Albers (paralelos -2° e -22°, meridiano central -54°)",
  viewBox,
  ufs,
};
writeFileSync(OUTPUT, `${JSON.stringify(output)}\n`);
console.log(`wrote ${OUTPUT}: ${ufs.length} UFs, ${JSON.stringify(output).length} bytes, viewBox ${viewBox.join(" ")}`);
