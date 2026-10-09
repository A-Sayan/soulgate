"""Inter alt kümelerini (fonts/inter-*.woff) yeniden üretir.

Kaynak: Inter 4.1 sürüm paketindeki ekran için ayarlanmış (hinted) TrueType
dosyaları (Inter-4.1.zip → extras/ttf/Inter-{Regular,Medium,SemiBold,Bold}.ttf).
Hinting korunur: Windows'ta küçük boyutlarda yazılar pürüzsüz ve keskin çıkar
(eski, ayarsız CFF sürümü orada pikselli görünüyordu). Karakter kümesi ve
özellikler mevcut dosyadan okunur; böylece Türkçe ve oyundaki simgeler aynı kalır.

Kullanım (depo kökünden):  python3 tools/make-fonts.py <extras/ttf klasörü>
Gerekli: fontTools.
"""
import sys
from fontTools.ttLib import TTFont
from fontTools import subset

src = sys.argv[1]
uni = sorted(TTFont('fonts/inter-400.woff').getBestCmap().keys())
for weight, name in [(400, 'Regular'), (500, 'Medium'), (600, 'SemiBold'), (700, 'Bold')]:
    font = TTFont(f'{src}/Inter-{name}.ttf')
    opts = subset.Options()
    opts.layout_features = ['calt', 'case', 'ccmp', 'locl', 'tnum', 'kern', 'mark', 'mkmk']
    opts.hinting = True
    opts.flavor = 'woff'
    opts.name_IDs = ['*']
    opts.notdef_outline = True
    sub = subset.Subsetter(opts)
    sub.populate(unicodes=uni)
    sub.subset(font)
    font.flavor = 'woff'
    font.save(f'fonts/inter-{weight}.woff')
    print(f'fonts/inter-{weight}.woff')
