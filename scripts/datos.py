"""Genera docs/datos.js con los resultados por provincia (Congreso 2023 y VOX en
noviembre de 2019) a partir de las páginas de cada circunscripción en Wikipedia,
que copian los resultados oficiales del Ministerio del Interior.

Uso: py scripts/datos.py <carpeta_cache>

Comprueba que D'Hondt con la barrera del 3 % reproduce los escaños reales de
2023 en las 52 circunscripciones; si no cuadra, para.
"""
import json
import os
import re
import sys
import urllib.parse
import urllib.request

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = sys.argv[1] if len(sys.argv) > 1 else os.path.join(RAIZ, 'cache')
os.makedirs(CACHE, exist_ok=True)

# Título en Wikipedia -> (nombre en la web, columna, fila del mapa de casillas)
PROVINCIAS = {
    'A Coruña': ('La Coruña', 0, 0), 'Lugo': ('Lugo', 1, 0), 'Asturias': ('Asturias', 2, 0),
    'Cantabria': ('Cantabria', 3, 0), 'Biscay': ('Vizcaya', 4, 0), 'Gipuzkoa': ('Guipúzcoa', 5, 0),
    'Navarre': ('Navarra', 6, 0), 'Huesca': ('Huesca', 7, 0), 'Lleida': ('Lérida', 8, 0),
    'Girona': ('Gerona', 9, 0),
    'Pontevedra': ('Pontevedra', 0, 1), 'Ourense': ('Orense', 1, 1), 'León': ('León', 2, 1),
    'Palencia': ('Palencia', 3, 1), 'Burgos': ('Burgos', 4, 1), 'Álava': ('Álava', 5, 1),
    'La Rioja': ('La Rioja', 6, 1), 'Zaragoza': ('Zaragoza', 7, 1), 'Tarragona': ('Tarragona', 8, 1),
    'Barcelona': ('Barcelona', 9, 1),
    'Zamora': ('Zamora', 2, 2), 'Valladolid': ('Valladolid', 3, 2), 'Segovia': ('Segovia', 4, 2),
    'Soria': ('Soria', 5, 2), 'Teruel': ('Teruel', 7, 2), 'Castellón': ('Castellón', 8, 2),
    'Salamanca': ('Salamanca', 2, 3), 'Ávila': ('Ávila', 3, 3), 'Madrid': ('Madrid', 4, 3),
    'Guadalajara': ('Guadalajara', 5, 3), 'Cuenca': ('Cuenca', 6, 3), 'Valencia': ('Valencia', 7, 3),
    'Balearic Islands': ('Baleares', 9, 3),
    'Cáceres': ('Cáceres', 3, 4), 'Toledo': ('Toledo', 4, 4), 'Ciudad Real': ('Ciudad Real', 5, 4),
    'Albacete': ('Albacete', 6, 4), 'Alicante': ('Alicante', 7, 4),
    'Badajoz': ('Badajoz', 3, 5), 'Córdoba': ('Córdoba', 4, 5), 'Jaén': ('Jaén', 5, 5),
    'Murcia': ('Murcia', 6, 5),
    'Huelva': ('Huelva', 2, 6), 'Seville': ('Sevilla', 3, 6), 'Málaga': ('Málaga', 4, 6),
    'Granada': ('Granada', 5, 6), 'Almería': ('Almería', 6, 6),
    'Cádiz': ('Cádiz', 3, 7),
    'Santa Cruz de Tenerife': ('Santa Cruz de Tenerife', 0, 8), 'Las Palmas': ('Las Palmas', 1, 8),
    'Ceuta': ('Ceuta', 3, 8), 'Melilla': ('Melilla', 5, 8),
}


def baja(titulo):
    f = os.path.join(CACHE, re.sub(r'[^\w]+', '_', titulo) + '.txt')
    if not os.path.exists(f):
        url = 'https://en.wikipedia.org/w/index.php?action=raw&title=' + urllib.parse.quote(titulo.replace(' ', '_'))
        req = urllib.request.Request(url, headers={'User-Agent': 'cuanto-vale-tu-voto/1.0 (datos electorales)'})
        with urllib.request.urlopen(req, timeout=60) as r, open(f, 'w', encoding='utf-8') as s:
            s.write(r.read().decode('utf-8'))
    with open(f, encoding='utf-8') as s:
        return s.read()


def sigla(linea):
    m = re.findall(r'\(([^()]*)\)\s*(?:<sup>.*)?$', linea.strip())
    s = m[-1] if m else linea
    s = re.sub(r'\[\[[^|\]]*\|([^\]]*)\]\]', r'\1', s)
    s = re.sub(r'\[\[([^\]]*)\]\]', r'\1', s)
    for clave, nombre in (('PSOE', 'PSOE'), ('Sumar', 'Sumar'), ('PNV', 'PNV'), ('Bildu', 'EH Bildu')):
        if clave in s:
            return nombre
    if s == 'Vox':
        return 'VOX'
    for pre, nombre in (('ERC', 'ERC'), ('Junts', 'Junts'), ('CCa', 'CC')):
        if s.startswith(pre):
            return nombre
    return s


def num(x):
    return int(x.replace(',', ''))


def seccion(txt, cabecera):
    """Filas de partidos (sigla, votos, %, escaños) y votos válidos de una elección."""
    i = txt.index(cabecera)
    j = txt.index('Valid votes', i)
    lineas = txt[i:j + 200].split('\n')
    partidos = []
    for k, l in enumerate(lineas):
        if l.startswith('| align="left"|') and 'colspan' not in l:
            v = re.match(r'\|\s*([\d,]+)\s*\|\|\s*([\d.]+)', lineas[k + 1])
            s = re.match(r"\|\s*'*(\d+)", lineas[k + 2])
            if v:
                partidos.append((sigla(l), num(v.group(1)), float(v.group(2)), int(s.group(1)) if s else 0))
    k = next(k for k, l in enumerate(lineas) if 'Valid votes' in l)
    validos = num(re.match(r'\|\s*([\d,]+)', lineas[k + 1]).group(1))
    return partidos, validos


def dhondt(votos, escanos, validos):
    c = []
    for nombre, v in votos.items():
        if v >= validos * 0.03:
            c += [(v / d, v, nombre) for d in range(1, escanos + 1)]
    c.sort(reverse=True)
    r = {}
    for _, _, nombre in c[:escanos]:
        r[nombre] = r.get(nombre, 0) + 1
    return r


salida = []
for titulo, (nombre, x, y) in PROVINCIAS.items():
    txt = baja(titulo + ' (Congress of Deputies constituency)')
    pob = num(re.search(r'\|\s*population\s*=\s*(?:\{\{[^}]*\}\}\s*)?([\d,]+)', txt).group(1))
    p23, val23 = seccion(txt, '23 July 2023')
    p19, _ = seccion(txt, '10 November 2019')
    escanos = sum(p[3] for p in p23)
    real = {p[0]: p[3] for p in p23 if p[3]}
    # Solo hacen falta los partidos que pasan la barrera del 3 %
    votos = {p[0]: p[1] for p in p23 if p[1] >= val23 * 0.03}
    if dhondt(votos, escanos, val23) != real:
        sys.exit(f'No cuadra el reparto de {nombre}: {real}')
    vox19 = next((p for p in p19 if p[0] == 'VOX'), None)
    vox23 = next((p for p in p23 if p[0] == 'VOX'), None)
    salida.append({
        'n': nombre, 'x': x, 'y': y, 'esc': escanos, 'pob': pob, 'val': val23, 'v': votos,
        'vox19': [vox19[2], vox19[3]] if vox19 else None,
        'vox23': [vox23[2], vox23[3]] if vox23 else None,
    })

salida.sort(key=lambda p: (p['y'], p['x']))
assert len(salida) == 52 and sum(p['esc'] for p in salida) == 350
destino = os.path.join(RAIZ, 'docs', 'datos.js')
with open(destino, 'w', encoding='utf-8') as f:
    f.write('// Generado por scripts/datos.py: resultados del Congreso 2023 por provincia\n')
    f.write('window.PROVINCIAS = ')
    json.dump(salida, f, ensure_ascii=False, separators=(',', ':'))
    f.write(';\n')
print('ok:', destino, os.path.getsize(destino), 'bytes')
