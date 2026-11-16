import torch, time, torch.nn as nn, torchvision
torch.set_num_threads(4)
print(torch.__version__, torch.cuda.is_available())
m = torchvision.models.mobilenet_v3_small(weights=None).features
head = nn.Sequential(nn.Conv2d(576, 96, 1), nn.ReLU(), nn.Upsample(scale_factor=4), nn.Conv2d(96, 8, 3, padding=1))
net = nn.Sequential(m, head)
print('params M', sum(p.numel() for p in net.parameters())/1e6)
opt = torch.optim.AdamW(net.parameters(), 1e-3)
for res in [(160, 288), (224, 384)]:
    x = torch.randn(32, 3, *res)
    t = time.time(); n = 0
    for i in range(6):
        y = net(x); loss = y.pow(2).mean(); opt.zero_grad(); loss.backward(); opt.step(); n += 32
    print(res, 'train img/s', n/(time.time()-t))
    net.eval()
    with torch.no_grad():
        t = time.time(); net(x[:1]); net(x[:1]); print('infer ms', (time.time()-t)/2*1000)
    net.train()
