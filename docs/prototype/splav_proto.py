# Черновой прототип симуляции «Сплава» и бота (Python).
# Иллюстрация правил §3 ТЗ, на нём проверялись пределы потока LD-07.
# Упрощения: нет руки и таймера удержания, бустеров, коряг; «взять и отпустить» — одно действие.
# Источник истины — docs/TZ.md.
# Прототип симуляции «Сплава» по §3 ТЗ (упрощённо: без бустеров), проверка ботом.
import sys
M=2**32
def mulberry(s):
    s=(s+0x6D2B79F5)%M
    t=s
    t=((t^(t>>15))*(t|1))%M
    t^=(t+((t^(t>>7))*(t|61))%M)%M
    return s,((t^(t>>14))%M)/M

class Sim:
    def __init__(s,lv,seed):
        s.L=lv; s.cols=lv['lanes']+2; s.rows=lv['rows']; s.st=lv['stepTicks']
        s.g=[None]*(s.cols*s.rows); s.rng=seed; s.nid=1
        for o in lv.get('obstacles',[]): s.g[o['row']*s.cols+o['col']]=('rock',)
        s.piers=[]
        for p in lv['piers']:
            s.g[p['row']*s.cols+p['col']]=('pier',len(s.piers)); s.piers.append({'orders':p['orders'],'done':0})
        for it in lv.get('initial',[]): s.put(it['col'],it['row'],(it['chain'],it['level']))
        s.bw=[None]*lv['backwater']; s.lost=0; s.lives=lv['lives']; s.tick=0; s.sc=0; s.freeze=0
        s.flow=not lv.get('waitFirstMerge'); s.combo=0; s.last=-999; s.coins=0; s.status='playing'
        s.hand=None; s.merges=0; s.maxcombo=0; s.jam=0
    def put(s,c,r,it): s.g[r*s.cols+c]=('item',it)
    def get(s,c,r): return s.g[r*s.cols+c]
    def r(s):
        s.rng,v=mulberry(s.rng); return v
    def isriver(s,c): return 1<=c<=s.cols-2
    def to_bw(s,it):
        for i in range(len(s.bw)):
            if s.bw[i] is None: s.bw[i]=it; return
        s.lost+=1
    def flowstep(s):
        R=s.rows
        for c in range(1,s.cols-1):
            cell=s.get(c,R-1)
            if cell and cell[0]=='item': s.to_bw(cell[1]); s.g[(R-1)*s.cols+c]=None
        for r in range(R-2,-1,-1):
            for c in range(1,s.cols-1):
                cell=s.get(c,r)
                if cell and cell[0]=='item' and s.get(c,r+1) is None:
                    s.g[(r+1)*s.cols+c]=cell; s.g[r*s.cols+c]=None
        sp=s.L['spawn']; mn,mx=sp['perStep']; n=mn+int(s.r()*(mx-mn+1))
        lanes=list(range(1,s.cols-1))
        for i in range(len(lanes)-1,0,-1):
            j=int(s.r()*(i+1)); lanes[i],lanes[j]=lanes[j],lanes[i]
        tot=sum(w['w'] for w in sp['weights'])
        for c in lanes[:n]:
            x=s.r()*tot; pick=sp['weights'][-1]
            for w in sp['weights']:
                if x<w['w']: pick=w; break
                x-=w['w']
            if s.get(c,0) is None: s.put(c,0,(pick['chain'],pick['level']))
            else: s.jam+=1
    def cur_orders(s):
        return [(i,p['orders'][p['done']]) for i,p in enumerate(s.piers) if p['done']<len(p['orders'])]
    def merge_at(s,c,r,lvl,chain):
        s.put(c,r,(chain,lvl)); s.after_merge()
        while True:
            found=False
            for dc,dr in ((0,1),(-1,0),(1,0),(0,-1)):
                cc,rr=c+dc,r+dr
                if 0<=cc<s.cols and 0<=rr<s.rows:
                    n=s.get(cc,rr)
                    if n and n[0]=='item' and n[1]==s.get(c,r)[1] and n[1][1]<6:
                        s.g[rr*s.cols+cc]=None; ch,l=s.get(c,r)[1]; s.put(c,r,(ch,l+1)); s.after_merge(); found=True; break
            if not found: break
    def after_merge(s):
        s.merges+=1
        s.combo = s.combo+1 if s.tick-s.last<=20 else 1
        s.last=s.tick; s.maxcombo=max(s.maxcombo,s.combo)
        if s.combo%5==0: s.freeze=max(s.freeze,30)
        s.flow=True
    # действие «перенести» (grab+drop за одно решение бота)
    def take(s,ref):
        if ref[0]=='bw': it=s.bw[ref[1]]; s.bw[ref[1]]=None
        else:
            it=s.get(ref[1],ref[2])[1]; s.g[ref[2]*s.cols+ref[1]]=None
        return it
    def act(s,src,dst):
        it=s.take(src)
        c,r=dst; cell=s.get(c,r)
        if cell is None: s.put(c,r,it); return
        if cell[0]=='item' and cell[1]==it and it[1]<6: s.merge_at(c,r,it[1]+1,it[0]); return
        if cell[0]=='pier':
            p=s.piers[cell[1]]
            if p['done']<len(p['orders']) and (p['orders'][p['done']]['chain'],p['orders'][p['done']]['level'])==it:
                p['done']+=1; s.coins+=10*it[1]; return
        raise Exception('bad act')
    def step(s):
        if s.status!='playing': return
        s.tick+=1
        if s.freeze>0: s.freeze-=1
        elif s.flow:
            s.sc+=1
            if s.sc>=s.st: s.flowstep(); s.sc=0
        if not s.cur_orders(): s.status='won'
        elif s.lost>=s.lives: s.status='lost'

def items(s):
    out=[]
    for r in range(s.rows):
        for c in range(s.cols):
            cell=s.get(c,r)
            if cell and cell[0]=='item': out.append((('cell',c,r),cell[1],r))
    for i,it in enumerate(s.bw):
        if it: out.append((('bw',i),it,s.rows))
    return out

def need(s):
    # сколько единиц 1-го уровня цепочки нужно оставшимся заказам — упрощение для «спасения»
    return {o['chain'] for p in s.piers for o in p['orders'][p['done']:]}

def bot(s):
    its=items(s)
    pier_cells={}
    for r in range(s.rows):
        for c in range(s.cols):
            cell=s.get(c,r)
            if cell and cell[0]=='pier': pier_cells[cell[1]]=(c,r)
    for pi,o in s.cur_orders():
        for ref,it,_ in its:
            if it==(o['chain'],o['level']): s.act(ref,pier_cells[pi]); return True
    best=None
    for i in range(len(its)):
        for j in range(i+1,len(its)):
            a,b=its[i],its[j]
            if a[1]==b[1] and a[1][1]<6:
                # цель должна быть на поле
                low,high=(a,b) if a[2]>=b[2] else (b,a)
                if high[0][0]!='cell':
                    if low[0][0]!='cell': continue
                    low,high=high,low
                score=a[1][1]*10+low[2]
                if not best or score>best[0]: best=(score,low[0],high[0])
    if best:
        s.act(best[1],(best[2][1],best[2][2])); return True
    nd=need(s)
    for c in range(1,s.cols-1):
        cell=s.get(c,s.rows-1)
        if cell and cell[0]=='item' and cell[1][0] in nd:
            for bc in (0,s.cols-1):
                for r in range(s.rows):
                    if s.get(bc,r) is None:
                        s.act(('cell',c,s.rows-1),(bc,r)); return True
    return False

def run(lv,seed,delay):
    s=Sim(lv,seed); cd=0
    while s.status=='playing' and s.tick<20000:
        if cd<=0:
            if bot(s): cd=delay
        cd-=1; s.step()
    return s

lv={"lanes":3,"rows":7,"stepTicks":20,"waitFirstMerge":False,
 "spawn":{"perStep":[1,2],"weights":[{"chain":"wood","level":1,"w":5},{"chain":"garden","level":1,"w":4},{"chain":"wood","level":2,"w":1}]},
 "initial":[{"col":1,"row":2,"chain":"wood","level":1},{"col":3,"row":4,"chain":"wood","level":1}],
 "piers":[{"col":4,"row":2,"orders":[{"chain":"wood","level":3},{"chain":"garden","level":3}]}],
 "obstacles":[],"backwater":5,"lives":3}
for name,delay in (('fast',6),('slow',12)):
    res=[run(lv,1303+k,delay) for k in range(20)]
    won=sum(r.status=='won' for r in res)
    print(name,'won',won,'/20','avg lost',sum(r.lost for r in res)/20,'avg sec',round(sum(r.tick for r in res)/20/10,1),'avg merges',sum(r.merges for r in res)/20,'maxcombo',max(r.maxcombo for r in res))
# уровень потяжелее: 5×8, три цепочки, заказы до 5-го уровня
lv2={"lanes":5,"rows":8,"stepTicks":14,
 "spawn":{"perStep":[1,2],"weights":[{"chain":"wood","level":1,"w":4},{"chain":"garden","level":1,"w":3},{"chain":"stone","level":1,"w":3}]},
 "piers":[{"col":0,"row":2,"orders":[{"chain":"wood","level":4},{"chain":"stone","level":5}]},{"col":6,"row":3,"orders":[{"chain":"garden","level":4},{"chain":"stone","level":3},{"chain":"wood","level":5}]}],
 "obstacles":[{"type":"rock","col":2,"row":5}],"backwater":5,"lives":3}
for name,delay in (('fast',6),('slow',12)):
    res=[run(lv2,k,delay) for k in range(20)]
    won=sum(r.status=='won' for r in res)
    print('lv2',name,'won',won,'/20','avg lost',sum(r.lost for r in res)/20,'avg sec',round(sum(r.tick for r in res)/20/10,1),'maxcombo',max(r.maxcombo for r in res))
