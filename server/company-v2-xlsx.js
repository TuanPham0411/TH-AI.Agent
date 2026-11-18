// Minimal standards-based Office Open XML, ZIP_STORED. No macros or formulas.
const xml = (v) =>
  String(v ?? "")
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, "")
    .replace(
      /[<>&"']/g,
      (c) =>
        ({
          "<": "&lt;",
          ">": "&gt;",
          "&": "&amp;",
          '"': "&quot;",
          "'": "&apos;",
        })[c],
    );
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const b of bytes) {
    crc ^= b;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function zip(entries) {
  const chunks = [],
    central = [];
  let offset = 0;
  for (const [name, text] of entries) {
    const filename = Buffer.from(name),
      data = Buffer.from(text),
      crc = crc32(data),
      head = Buffer.alloc(30);
    head.writeUInt32LE(0x04034b50);
    head.writeUInt16LE(20, 4);
    head.writeUInt32LE(crc, 14);
    head.writeUInt32LE(data.length, 18);
    head.writeUInt32LE(data.length, 22);
    head.writeUInt16LE(filename.length, 26);
    chunks.push(head, filename, data);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50);
    c.writeUInt16LE(20, 4);
    c.writeUInt16LE(20, 6);
    c.writeUInt32LE(crc, 16);
    c.writeUInt32LE(data.length, 20);
    c.writeUInt32LE(data.length, 24);
    c.writeUInt16LE(filename.length, 28);
    c.writeUInt32LE(offset, 42);
    central.push(c, filename);
    offset += head.length + filename.length + data.length;
  }
  const bytes = Buffer.concat(central),
    end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(bytes.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...chunks, bytes, end]);
}
export function exportRows(rows, format = "xlsx") {
  if (
    !Array.isArray(rows) ||
    rows.length > 200 ||
    rows.some((r) => !r || typeof r !== "object" || Array.isArray(r))
  )
    throw Error("Export needs actual query rows (maximum 200).");
  const columns = [...new Set(rows.flatMap(Object.keys))];
  if (columns.length > 80)
    throw Error("Narrow the export to at most 80 columns.");
  const scalar = (v) =>
    v && typeof v === "object" ? JSON.stringify(v) : (v ?? "");
  const matrix = [
    columns,
    ...rows.map((r) => columns.map((k) => scalar(r[k]))),
  ];
  if (format === "json")
    return { type: "application/json", content: JSON.stringify(rows, null, 2) };
  if (format === "csv") {
    const q = (v) =>
      '"' +
      String(v)
        .replace(/^[=+@-]/, "'$&")
        .replaceAll('"', '""') +
      '"';
    return {
      type: "text/csv",
      content: "\ufeff" + matrix.map((r) => r.map(q).join(",")).join("\r\n"),
    };
  }
  if (format !== "xlsx") throw Error("Choose xlsx, csv or json.");
  const sheet =
    '<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>' +
    matrix
      .map(
        (r, i) =>
          '<row r="' +
          (i + 1) +
          '">' +
          r
            .map((v) =>
              typeof v === "number" && Number.isFinite(v)
                ? "<c><v>" + v + "</v></c>"
                : '<c t="inlineStr"><is><t xml:space="preserve">' +
                  xml(v) +
                  "</t></is></c>",
            )
            .join("") +
          "</row>",
      )
      .join("") +
    "</sheetData></worksheet>";
  const data = zip([
    [
      "[Content_Types].xml",
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
    ],
    [
      "_rels/.rels",
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    ],
    [
      "xl/workbook.xml",
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Results" sheetId="1" r:id="rId1"/></sheets></workbook>',
    ],
    [
      "xl/_rels/workbook.xml.rels",
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
    ],
    ["xl/worksheets/sheet1.xml", sheet],
  ]);
  if (data.length > 950000)
    throw Error("The spreadsheet is too large. Narrow the query.");
  return {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    content: data.toString("base64"),
    encoding: "base64",
  };
}
