"""Render only verified single-DIB placeable WMF, in a finite child process.

Not a general vector/EMF renderer. MS-WMF 2.3.1.3.1 defines DIBSTRETCHBLT.
No escape, fonts, objects, overlays or arbitrary record playback is admitted.
"""
from hashlib import sha256
from io import BytesIO
from pathlib import Path
import struct
import subprocess
import sys

MAGIC = b'\xd7\xcd\xc6\x9a\x00\x00'
DPI = 288
MAX_BYTES = 4 * 1024 * 1024


def inspect_bitmap_wmf(blob, pixel_budget=25_000_000):
    if len(blob)<100 or len(blob)>MAX_BYTES or not blob.startswith(MAGIC):
        raise ValueError('WMF signature or byte budget')
    checksum=0
    for word in struct.unpack_from('<10H',blob):checksum ^= word
    if checksum != struct.unpack_from('<H',blob,20)[0]:
        raise ValueError('WMF placeable checksum')
    _,handle,left,top,right,bottom,inch,reserved,_=struct.unpack_from('<IHhhhhHIH',blob)
    width,height=right-left,bottom-top
    if handle or reserved or not 16<=inch<=10000 or min(width,height)<=0 or max(width,height)>32767:
        raise ValueError('WMF placeable bounds')
    size=(int(width*DPI/inch),int(height*DPI/inch))
    if min(size)<1 or max(size)>20000 or size[0]*size[1]>pixel_budget:
        raise ValueError('WMF rendered pixel budget')
    kind,header,version,words,objects,max_record,unused=struct.unpack_from('<HHHIHIH',blob,22)
    if (kind not in (1,2) or header!=9 or version not in (0x100,0x300)
            or words*2!=len(blob)-22 or objects!=0 or unused):
        raise ValueError('WMF unsupported header')
    records=[];offset=40
    while offset<len(blob) and len(records)<5:
        if offset+6>len(blob):raise ValueError('WMF truncated record')
        count,function=struct.unpack_from('<IH',blob,offset)
        if count<3 or offset+count*2>len(blob):raise ValueError('WMF invalid record length')
        records.append((function,blob[offset+6:offset+count*2],count))
        offset+=count*2
    if (offset!=len(blob) or [r[0] for r in records]!=[0x20b,0x20c,0xb41,0]
            or max_record!=max(r[2] for r in records)):
        raise ValueError('WMF requires one bitmap and no other drawing or escape records')
    origin,extent,drawing,end=(r[1] for r in records)
    if (origin!=struct.pack('<hh',top,left) or extent!=struct.pack('<hh',height,width)
            or end or len(drawing)<60):
        raise ValueError('WMF viewport or EOF mismatch')
    rop,src_h,src_w,src_y,src_x,dest_h,dest_w,dest_y,dest_x=struct.unpack_from('<Ihhhhhhhh',drawing)
    dib=drawing[20:]
    dib_header,w,h,planes,bits,compression,image_bytes,xppm,yppm,colors,important=struct.unpack_from('<IiiHHIIiiII',dib)
    stride=((w*24+31)//32)*4
    if (dib_header!=40 or min(w,abs(h))<1 or max(w,abs(h))>20000
            or w*abs(h)>25_000_000 or planes!=1 or bits!=24 or compression!=0
            or colors or important or image_bytes not in (0,stride*abs(h))
            or len(dib)!=40+stride*abs(h)):
        raise ValueError('WMF requires bounded uncompressed 24-bit DIB')
    if (rop not in (0x00cc0020,0x008800c6) or (src_h,src_w,src_y,src_x)!=(abs(h),w,0,0)
            or (dest_h,dest_w,dest_y,dest_x)!=(height,width,top,left)):
        raise ValueError('WMF unsupported raster operation or cropped bitmap')
    return size


def render_bitmap_wmf(blob, pixel_budget=25_000_000):
    from PIL import Image
    size=inspect_bitmap_wmf(blob,pixel_budget)
    if not hasattr(Image.core,'drawwmf'):
        raise ValueError('WMF Windows renderer unavailable')
    result=subprocess.run([sys.executable,'-m','app.wmf_bitmap','--render'],input=blob,
        capture_output=True,timeout=15,cwd=Path(__file__).resolve().parents[1],
        creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
    if result.returncode or len(result.stdout)>size[0]*size[1]*4+65536:
        raise ValueError('WMF bounded renderer failed')
    with Image.open(BytesIO(result.stdout)) as image:
        if image.format!='PNG' or image.size!=size:
            raise ValueError('WMF rendered output mismatch')
        image.verify()
    return result.stdout, f'WMF {DPI}DPI 渲染图 SHA256={sha256(result.stdout).hexdigest()}；坐标为渲染图像素，非Word页坐标；图章识别不证明真实性'


def _main():
    from PIL import Image
    blob=sys.stdin.buffer.read(MAX_BYTES+1)
    size=inspect_bitmap_wmf(blob)
    with Image.open(BytesIO(blob)) as image:
        image.load(dpi=DPI)
        if image.size!=size:raise ValueError('WMF size mismatch')
        output=BytesIO();image.save(output,format='PNG')
    sys.stdout.buffer.write(output.getvalue())


if __name__=='__main__':
    try:
        if sys.argv[1:]!=['--render']:raise ValueError('Explicit render mode required')
        _main()
    except Exception:
        sys.stderr.write('WMF_RENDER_FAILED\n')
        raise SystemExit(1)
