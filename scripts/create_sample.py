"""Create a synthetic XLSX with no application, database or mail connection."""
import argparse
from datetime import date
from pathlib import Path
import re
import xml.etree.ElementTree as ET
import zipfile

root = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--period', default=date.today().strftime('%Y-%m'), help='Periodo YYYY-MM (default: current month)')
parser.add_argument('--output', type=Path, default=root / 'artifacts' / 'productos-demo.xlsx')
args = parser.parse_args()
if not re.fullmatch(r'\d{4}-(0[1-9]|1[0-2])', args.period):
    parser.error('--period must use YYYY-MM')
if args.output.exists():
    parser.error('Output already exists; choose another --output path')

ns = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
ET.register_namespace('', ns)
sheet = ET.Element(f'{{{ns}}}worksheet')
ET.SubElement(sheet, f'{{{ns}}}dimension', ref='A1:D6')
data = ET.SubElement(sheet, f'{{{ns}}}sheetData')
prefix = 'DEMO-' + args.period
rows = [
    ['Periodo', 'CodigoProducto', 'NombreProducto', 'Precio'],
    [args.period, prefix+'-A', 'Producto A', '12.50'],
    [args.period, prefix+'-B', 'Producto B', '8.00'],
    [args.period, prefix+'-A', 'Repetido: no sobrescribe el precio', '99.00'],
    [args.period, prefix+'-C', None, None],
    [args.period, None, 'Fila sin código para mostrar auditoría', '5.00'],
]
for number, values in enumerate(rows, 1):
    row = ET.SubElement(data, f'{{{ns}}}row', r=str(number))
    for column, value in zip('ABCD', values):
        if value is None:
            continue
        cell = ET.SubElement(row, f'{{{ns}}}c', r=column+str(number), t='inlineStr')
        ET.SubElement(ET.SubElement(cell, f'{{{ns}}}is'), f'{{{ns}}}t').text = value
args.output.parent.mkdir(parents=True, exist_ok=True)
# Reuse only the tracked XLSX package; replace its complete product worksheet.
with zipfile.ZipFile(root / 'backend/tests/fixtures/products.xlsx') as template:
    with args.output.open('xb') as output, zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED) as generated:
        for item in template.infolist():
            generated.writestr(item.filename, ET.tostring(sheet, encoding='utf-8')
                              if item.filename == 'xl/worksheets/sheet1.xml' else template.read(item))
print('Created:', args.output.resolve())
print('On an unused period/catalog: 3 inserted, 1 duplicate, 1 invalid row; sum of inserted prices: 20.50 (no currency).')
