# VPS 部署指南（腾讯云轻量 · 新加坡 · IP 访问）

> 目标：把这个项目部署到一台云服务器上，用 `http://公网IP` 就能访问，不用备案。
> 适合：想给其他人（学生/家长/同事）用，但暂时不想折腾域名和备案。

---

## 一、买服务器

1. 打开腾讯云活动页（新用户专享价，每人限 1 台）：
   `https://cloud.tencent.com/act/pro/lighthouse`
2. 选择配置：

   | 项目 | 选什么 |
   |---|---|
   | 地域 | **新加坡**（免备案，且与 Supabase 同区，延迟低） |
   | 套餐 | **2核2G**（99 元/年档） |
   | 镜像 | **Ubuntu 22.04 LTS**（不要选 CentOS） |
   | 时长 | 1 年 |

3. 下单后，在控制台 → 轻量应用服务器 → 找到这台机器，记下：
   - **公网 IP**（形如 `43.156.xx.xx`）
   - 在「重置密码」里设置一个 **root 密码**（记住它）

4. **开放 80 端口**：进入这台服务器 → **防火墙** → 添加规则
   - 应用类型：HTTP(80)
   - 协议：TCP
   - 端口：80
   - 来源：全部（`0.0.0.0/0`）

---

## 二、连接服务器

在你自己的 Windows 电脑上，打开 **PowerShell**，执行（把 IP 换成你的）：

```powershell
ssh root@43.156.xx.xx
```

- 第一次会问 `Are you sure you want to continue connecting?` → 输入 `yes` 回车
- 然后输入你刚才设置的 root 密码（**输入时屏幕不显示字符，这是正常的**，输完直接回车）

看到类似 `root@VM-xxx:~#` 的提示符，就说明登录成功了。

---

## 三、一键部署

依次复制粘贴下面 4 段命令（每段执行完再执行下一段）：

### 1. 安装 Docker

```bash
curl -fsSL https://get.docker.com | sh
```

### 2. 下载代码

```bash
cd /root
git clone https://github.com/lechenzhang0926-dotcom/tutor-feedback.git
cd tutor-feedback
```

### 3. 填配置

```bash
nano .env.local
```

在弹出的编辑器里，粘贴下面 4 行（值换成你自己的）：

```
DEEPSEEK_API_KEY=你的deepseek密钥
ANTHROPIC_API_KEY=你的anthropic密钥
NEXT_PUBLIC_SUPABASE_URL=https://fimfolkytdjwvpzwnvfd.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=你的anon密钥
```

> 保存方法：按 `Ctrl + O`，回车确认，再按 `Ctrl + X` 退出。
> 前两个密钥在你本地电脑的 `C:\Users\33696\Projects\tutor-feedback\.env.local` 里能复制到。

### 4. 构建并启动

```bash
bash scripts/deploy-vps.sh
```

首次构建需要 **5～10 分钟**（要下载 Chromium 浏览器），耐心等。
最后看到 `✅ 部署成功` 就好了。

---

## 四、访问

在浏览器打开：

```
http://你的公网IP
```

例如 `http://43.156.12.34`。

注册一个账号就能用了。

---

## 五、日常维护

```bash
# 查看实时日志
docker logs -f tutor-feedback

# 重启
docker restart tutor-feedback

# 更新代码后重新部署
cd /root/tutor-feedback
git pull
bash scripts/deploy-vps.sh
```

---

## 常见问题

**Q：打开是空白 / 连不上？**
A：先确认防火墙开了 80 端口；再在服务器上执行 `curl -I http://127.0.0.1` 看服务本身是否正常。

**Q：注册后登录不了，或数据存不上？**
A：多半是 `NEXT_PUBLIC_SUPABASE_*` 没在**构建时**生效。重新执行一次 `bash scripts/deploy-vps.sh`（脚本会自动把它们作为 build-arg 传进去）。

**Q：生成 PDF 报错？**
A：在服务器上执行 `free -h` 看内存。2G 一般够用；如果同时多人批量生成，可能需要升到 4G。

**Q：以后想绑自己的域名？**
A：买好域名后，在腾讯云加一条 A 记录指向这台服务器的 IP 即可（新加坡节点免备案）。
