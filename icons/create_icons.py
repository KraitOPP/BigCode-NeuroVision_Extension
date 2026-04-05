"""
Run this script to generate simple placeholder PNG icons for the extension.
Requires Pillow: pip install Pillow
"""
import struct, zlib, os

def create_png(size, color_hex):
    """Creates a minimal solid-color PNG without external deps."""
    r = int(color_hex[1:3], 16)
    g = int(color_hex[3:5], 16)
    b = int(color_hex[5:7], 16)

    def chunk(name, data):
        c = struct.pack('>I', len(data)) + name + data
        crc = zlib.crc32(name + data) & 0xffffffff
        return c + struct.pack('>I', crc)

    raw = b''
    for _ in range(size):
        row = b'\x00' + bytes([r, g, b, 255] * size)
        raw += row

    compressed = zlib.compress(raw)
    ihdr_data = struct.pack('>IIBBBBB', size, size, 8, 2, 0, 0, 0)
    png = (
        b'\x89PNG\r\n\x1a\n'
        + chunk(b'IHDR', ihdr_data)
        + chunk(b'IDAT', compressed)
        + chunk(b'IEND', b'')
    )
    return png

# Generate icons
script_dir = os.path.dirname(os.path.abspath(__file__))
for size in [16, 32, 48, 128]:
    png_data = create_png(size, '#4A6FA5')  # NeuroVision blue
    path = os.path.join(script_dir, f'icon{size}.png')
    with open(path, 'wb') as f:
        f.write(png_data)
    print(f'Created {path}')

print('Done! Icons created in icons/ folder.')
