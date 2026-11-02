using System.Globalization;
using System.IO.Compression;
using System.Text.RegularExpressions;
using System.Xml;
using System.Xml.Linq;
using ClosedXML.Excel;
using Shared;

public record ParsedRow(int Number, string Period, string Code, string Name, decimal Price, string? Error);
public static partial class ExcelReader
{
    [GeneratedRegex(@"^\d{4}-(0[1-9]|1[0-2])$")]
    private static partial Regex PeriodPattern();
    public static List<ParsedRow> Read(byte[] bytes, int maxRows, long maxExpanded)
    {
        try
        {
            using (var zip = new ZipArchive(new MemoryStream(bytes), ZipArchiveMode.Read))
            {
                if (zip.Entries.Count > 2000 || zip.Entries.Sum(e => e.Length) > maxExpanded) throw new RejectedException("El XLSX excede el límite descomprimido");
                if (zip.Entries.Any(e => e.FullName.Contains("vbaProject", StringComparison.OrdinalIgnoreCase) || e.FullName.Contains("macrosheets", StringComparison.OrdinalIgnoreCase) || e.FullName.Contains("externalLinks", StringComparison.OrdinalIgnoreCase) || e.FullName.Contains("embeddings", StringComparison.OrdinalIgnoreCase)))
                    throw new RejectedException("El archivo contiene macros, vínculos externos u objetos incrustados");
                foreach (var entry in zip.Entries.Where(e => e.FullName.EndsWith(".rels", StringComparison.OrdinalIgnoreCase)))
                {
                    using var input = entry.Open();
                    using var reader = XmlReader.Create(input, new XmlReaderSettings { DtdProcessing = DtdProcessing.Prohibit, XmlResolver = null });
                    if (XDocument.Load(reader).Descendants().Any(e => string.Equals((string?)e.Attribute("TargetMode"), "External", StringComparison.OrdinalIgnoreCase)))
                        throw new RejectedException("El archivo contiene relaciones a recursos externos");
                }
                if (!zip.Entries.Any(e => e.FullName == "xl/workbook.xml")) throw new RejectedException("El archivo no es un XLSX válido");
            }
            using var workbook = new XLWorkbook(new MemoryStream(bytes));
            if (workbook.Worksheets.Count != 1) throw new RejectedException("Se requiere una sola hoja de productos");
            var sheet = workbook.Worksheet(1);
            if ((sheet.LastRowUsed()?.RowNumber() ?? 0) > maxRows + 1 || (sheet.LastColumnUsed()?.ColumnNumber() ?? 0) > 4)
                throw new RejectedException("Se excedió el límite de filas o se encontraron columnas adicionales");
            var headers = new[] { "Periodo", "CodigoProducto", "NombreProducto", "Precio" };
            for (var col = 1; col <= 4; col++)
                if (sheet.Cell(1, col).HasFormula || !sheet.Cell(1, col).GetString().Trim().Equals(headers[col - 1], StringComparison.OrdinalIgnoreCase))
                    throw new RejectedException("Columnas requeridas en orden: Periodo, CodigoProducto, NombreProducto, Precio");
            var rows = new List<ParsedRow>();
            foreach (var row in sheet.RowsUsed().Skip(1))
            {
                if (row.Cells(1, 4).All(c => c.IsEmpty())) continue;
                if (row.Cells(1, 4).Any(c => c.HasFormula)) throw new RejectedException("Se requieren valores de datos; las fórmulas no están permitidas");
                var period = row.Cell(1).GetString().Trim();
                var code = row.Cell(2).GetString().Trim().ToUpperInvariant();
                var name = row.Cell(3).GetString().Trim();
                string? error = null;
                if (!PeriodPattern().IsMatch(period)) error = "Periodo requerido en formato YYYY-MM";
                if (string.IsNullOrWhiteSpace(code) || code.Length > 100) error = "CodigoProducto requerido, máximo 100 caracteres";
                if (name.Length == 0) name = "Producto " + code;
                if (name.Length > 500) error = "NombreProducto excede 500 caracteres";
                decimal price = 0;
                var priceCell = row.Cell(4);
                if (!priceCell.IsEmpty() && !priceCell.TryGetValue<decimal>(out price)) error = "Precio inválido";
                if (price < 0 || price > 9999999999999999.99m || decimal.Round(price, 2) != price) error = "Precio fuera de rango o con más de dos decimales";
                // Invalid numeric values must still fit the typed staging table.
                if (price < 0 || price > 9999999999999999.99m || decimal.Round(price, 2) != price) price = 0;
                rows.Add(new(row.RowNumber(), period, code, name, price, error));
            }
            if (rows.Count == 0) throw new RejectedException("El archivo no contiene registros");
            return rows;
        }
        catch (RejectedException) { throw; }
        catch (Exception ex) when (ex is not OutOfMemoryException)
        { throw new RejectedException("No fue posible leer el XLSX; el archivo está corrupto o no es compatible"); }
    }
}
