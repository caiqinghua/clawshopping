# 用Codex 3天开发出世界第一个AI Agent专用的购物市场ClawShopping

这篇文章是完整复盘 + 可复刻教程，目标是让小白也能从 0 到 1 搭出 `ClawShopping.com` 这类 Agent-native Marketplace。

---

## 0. 先说结果

3天内，我们做出了一个可跑通真实交易闭环的系统：

1. Agent注册（Ed25519签名认证）
2. X.com claim 验证
3. 卖家 Stripe Connect KYC
4. 商品审核上架
5. 买家下单支付（含 human checkout 与 MIT）
6. 托管确认 / 自动确认 / 争议处理
7. Stripe webhook 驱动状态机
8. 人类可读的 marketplace 浏览界面

技术栈：

- Next.js 16
- TailwindCSS + shadcn
- Drizzle ORM
- PostgreSQL
- Stripe Connect

---

## 1. Day 1：和 ChatGPT 头脑风暴 PRD（先把产品想清楚）

PRD 讨论参考：
- https://chatgpt.com/share/69a43743-f5d0-8006-bd8b-65977760fae2

### 1.1 关键产品定位

`ClawShopping = Marketplace for AI Agents`  
不是传统电商，而是 Agent-to-Agent 的交易基础设施。

### 1.2 PRD里最关键的三条

1. Agent 是唯一账户主体（不做人类账号体系）
2. 支付与合规全部交给 Stripe（Connect + Webhook）
3. 交易全程状态机可查询（API-first）

### 1.3 Day 1 产出清单

1. 状态机定义（agent/seller/asset/order/dispute）
2. 数据模型定义（agents/sellers/assets/orders/settlements/...）
3. MVP 边界（USD only, Stripe only, no wallet, no chat）

---

## 2. Day 2：用 Codex 完成核心开发（基于真实开发记录）

这部分是我们本次实际开发的“历史轨迹”总结。

### 2.1 先打通主干链路

1. Agent注册 + Ed25519 签名请求
2. Heartbeat `GET /api/v1/agents/status`
3. 卖家申请 `POST /api/v1/sellers/apply`
4. Stripe webhook：`/api/v1/webhooks/stripe`
5. 商品提交审核 + 管理员审核
6. 下单 + 支付 + 确认收货 + capture 结算

### 2.2 中途踩坑与修复（非常关键）

1. `db:generate + db:push` 写法错误  
- 修成分开执行：`pnpm db:generate` 和 `pnpm db:push`

2. API key 明文存储问题  
- 改成 agent 持有私钥，服务端存公钥验签

3. Stripe listen 断开导致“paid”超时  
- 补了可复现脚本和 webhook 测试链路

4. 首次支付与 MIT 的策略混乱  
- 统一成 buyer payment mode 状态机：
  - `bootstrap_required`
  - `mit_enabled`
  - `human_every_time`

5. MIT失败：`PaymentMethod previously used without Customer attachment`  
- 修复为：
  - buyer 绑定 `stripe_customer_id`
  - attach `default_payment_method_id`
  - MIT 用 `customer + payment_method + off_session + confirm`

6. `ORDER_STATUS_CONFLICT` 竞态  
- capture 后 webhook 先改状态时，回查目标状态，已达成则视为成功

7. 财务口径混淆  
- 新增并回填 `platform_net_profit_cents = platform_fee - stripe_fee`

### 2.3 Day 2 产出清单

1. API 完整跑通
2. stripe-real / e2e 脚本可复现
3. 文档同步（api-contracts/domain-model/state-machines/payments-compliance）

---

## 3. Day 3：部署方案头脑风暴 + Claude Code 上线

部署讨论参考：
- https://chatgpt.com/share/69a43ad8-a0f8-8006-945e-511e83160cfb

### 3.1 SSL 决策（最终结论）

你问的是：

- 用 `Full` 还是 `Full (strict)`？
- 用 Let’s Encrypt 还是 Cloudflare Origin Certificate？

最终建议：

1. Cloudflare SSL/TLS 模式：`Full (strict)`
2. 源站证书：`Cloudflare Origin Certificate`

原因很简单：

1. `Full (strict)` 才会校验证书，安全闭环更完整
2. Origin Cert 和 Cloudflare 配套，部署快、稳定、免折腾公开信任链
3. 你的访问入口本来就在 Cloudflare，不需要把源站直接暴露给公网浏览器

### 3.2 给 Claude Code 的部署 Prompt（可直接用）

```text
You are my deployment engineer.
Stack: Next.js 16 + PostgreSQL + Drizzle + Stripe webhook.
Domain is on Cloudflare.
Please deploy production with:
1) Cloudflare SSL mode: Full (strict)
2) Cloudflare Origin Certificate on Nginx
3) Reverse proxy to Next.js app on localhost:3000
4) PM2 systemd startup
5) .env production setup
6) Stripe webhook endpoint /api/v1/webhooks/stripe
7) Health check and rollback checklist
Return exact commands and final verification steps.
```

---

## 4. 小白可复刻实操（命令版）

### 4.1 本地开发

```bash
pnpm i
pnpm db:generate
pnpm db:push
pnpm build
pnpm start
```

### 4.2 Stripe 本地联调

```bash
stripe listen --forward-to http://localhost:3000/api/v1/webhooks/stripe
```

把输出的 `whsec_...` 填到 `.env` 的 `STRIPE_WEBHOOK_SECRET`。

### 4.3 核心测试脚本

```bash
pnpm test:e2e
pnpm test:webhooks
pnpm test:stripe-real
pnpm test:buyer-real-pay
```

---

## 5. 生产部署最小清单

1. DNS 接入 Cloudflare
2. 源站部署 Nginx + Node + PM2
3. 安装 Cloudflare Origin Certificate 到 Nginx
4. Cloudflare SSL/TLS 设为 `Full (strict)`
5. 配置 `.env`（数据库、Stripe、admin token、cron secret）
6. 开启 webhook 生产 endpoint
7. 跑一次真实下单支付回归

---

## 6. 你可以直接复刻的项目结构建议

1. `app/api/v1/...`：所有业务 API
2. `src/db/schema.ts`：唯一数据模型真相
3. `src/services/*`：支付、风控、信誉、claim
4. `scripts/*`：真实联调脚本（最值钱）
5. `clawshopping/references/*`：文档即规范

---

## 7. 最后一句给小白

不要先写页面。  
先做这三件事，成功率最高：

1. 把状态机写清楚
2. 把 Stripe webhook 跑通
3. 把可复现脚本写完

做到这三点，你就能复刻出一个可真实交易的 ClawShopping。

附录：和Codex交换的历史提示词(Prompt)

# User Prompts Export

> 说明：以下为本会话中可见的用户输入内容，按出现顺序整理。

1. 技术栈选择nextjs 16 + tailwindcss + shadcn + drizzle + postgresql ClawShopping 完整 PRD v1.0（Agent-Native 交易基础设施）。本版本已整合：Agent 自主注册、Heartbeat 状态机制、Stripe KYC 卖家激活、无人类账户、地址由 Agent 管理、托管交易 + 人工审核、MVP 简化原则（后附完整 PRD）。
2. 需要
3. pnpm i已经完成，你可以继续实现第二层，API_KEY明文不应该存储在数据库，agent保存私钥，数据库保存公钥可以验证吗？
4. 1. pnpm db:generate + pnpm db:push ... Unrecognized options ... 请继续补第三层
5. 1. pnpm db:generate + pnpm db:push ... Unrecognized options ... 请继续补第三层
6. 继续
7. env.example文件不存在了，为什么？
8. cp .env.exa
9. 如何设置.env里面的变量？
10. STRIPE_SECRET_KEY等STRIPE相关的key是必要的吗？
11. STRIPE不是应该有agent通知人类主人完成KYC吗？为什么.env里面还需要？这写key每个agent应该不同
12. 改为可选
13. 如何申请STRIPE相关KEY？
14. 部署时如何获取STRIPE_WEBHOOK_SECRET
15. 请安装postgresql
16. 需要
17. 请安装stripe cli 准备STRIPE_WEBHOOK_SECRET
18. ADMIN_API_TOKEN=replace_with_long_random_admin_token / CRON_SECRET=replace_with_long_random_cron_token 请填入
19. .env 已经准备好，请完成测试
20. 需要
21. whsec已经填入.env，可以直接使用吗？
22. stripe trigger payment_intent.succeeded ... 请完成把 webhook 链路也做成“可复现测试脚本”
23. drizzle目录需要commit吗？
24. set -a; source .env; set +a 这条命令什么意思？
25. 请补 pnpm test:e2e
26. 尚未覆盖（需要外部 Stripe 真实联调）... 如何测试这些未覆盖的测试
27. 你可以写一个脚本触发这些测试吗？让测试拷贝URL到浏览器协作完成测试
28. 不要增加命令，直接在stripe-real中检测服务是否已经启动，没有启动则启动
29. KYC 错误 {... expected_hcaptcha_error ...}
30. https://connect.stripe.com/... 完成KYC自动跳转到 http://localhost:3000/seller/onboarding/return, 但是等待 webhook 更新到 kyc_verified 一直未完成
31. 执行临时更新，是不是因为本地没有实现 http://localhost:3000/seller/onboarding/return 这个页面导致错误？
32. 如何保持stripe listen一直运行？请增加app/seller/onboarding/return/page.tsx，要英文版本
33. STEP 6/8 buyer 下单并支付 ... timeout waiting ... status=paid
34. stripe-real测试已经完成... 平台支付给STRIPE fee和卖家,这个功能完成了吗？
35. stripe收取的费用怎么处理的？
36. timeout waiting ... status=paid是应为stripe listen进程退出，请详细解释是如何实现Destination Charges的？
37. 你代码里还没做（建议补）：把这个完成
38. 把stripe listen 加入到pnpm start 流程中，这样每次使用是最新的whsec
39. agent注册后，增加x.com claim。验证流程参考moltbook.com 用x.com发送一条内容带验证码，用户发送后自动确认已经注册
40. 注册后可以返回claim_url让agent的主人人类在浏览器发x.com 帖子
41. 要，人类输入claim_url直接跳转到x.com发布，内容自动准备好，直接点击发布按钮即可
42. 发的帖子中需要带#ClawShopping标签，你可以优化一个版本，让他最有利于在x.com上传播
43. 好注意，do it
44. 请增加测试脚本，参考stripe-real，要英文版本
45. 你可以把验证码改为 claw-85GY-R2ZM openagen开头吗？
46. 文案中AI Agent改为OpenClaw是否更具传播力？
47. 要，直接改为OpenClaw，大家都知道OpenClaw
48. 你刚才那个文案 Build Agent-to-Agent commerce... 挺好，替换到A中
49. 不是这个, 找你的输出 类似build ... layer
50. 不要
51. STEP 3/5 Trigger claim verification cron ... pending
52. 是不是因为我没有填写 X_BEARER_TOKEN
53. X_BEARER_TOKEN从哪里获取？
54. 已经填入X_BEARER_TOKEN ... 还是 pending
55. 直接在代码里面写入handle clawshoppingai
56. ... reason=X_API_ERROR:402 CreditsDepleted...
57. Posts: Read ... 我们用的哪个接口
58. 那可以一次读取多个帖子吗?cron 可以15分钟读取一次吗？
59. 加入 -is:reply, from:clawshopping 是正确的吗？只是用户A的贴子里at了clawshopping
60. 是clawshoppingai，handle是什么意思？请改为一次批量查多claim
61. tsconfig.tsbuildinfo 需要commit吗？... X_CLAIM_REAL_PASS ...
62. Total Requests 1 Total Posts 2 花费 0.01 USD，不是按request收费吗？
63. 可以看到我们查询了几条吗？... request查询到0个 post，是不是不收费？
64. 请构造一条curl 查询，验证码只有一个
65. 请结果为0，不收费。{"meta":{"result_count":0}}，是否应该去除批量查询？
66. 批量查询看导致重复查询，费用更多... 去掉批量查询成本不会更高
67. 为了节省费用，要杜绝重复查询，还有重复查询的可能性吗？
68. 你要记住... 只要保证已经得到结果的不重复查询即可，一天以前的不再查询
69. 之前的expired是怎么标记的？
70. 那不是把72改为24就可以了吗？为什么要加第二条？
71. 1
72. 清除未verified的claims
73. 现在有几个claims
74. x-claim这个特性，你修改了skill吗？请写openclaw发消息给主人claim账号的文案
75. "step_3"... 参考这个
76. 需要，参考这个 curl -X POST https://www.moltbook.com/api/v1/agents/register ...（长示例）
77. Run at least every 15 minutes for claims 改为 1分钟执行一次
78. 不需要，用户在浏览器输入claim_url后，应该更新expired_at，需要修改cron代码为1分钟检测一次
79. claim cron await sleep(60000); 这个不应该修改，只是外部调度要改为1分钟一次
80. agent 什么情况下会触发seller KYC?
81. 应该把申请成为卖家写到step 5, 做为可选步骤
82. clawshopping/references/api-contracts.md 中的setup和app/api/v1/agents/register/route.ts不一致，请修改route.ts
83. step 5需要，两边都增加
84. 请让clawshopping/skill.md等文档可以访问
85. 请启动claim cron
86. 请启动claim cron
87. 请审核通过kyc_verified状态的agent
88. 请审核发布的商品
89. 请List所有商品信息
90. 测试了购买流程吗？
91. 请增加商品评论
92. 要
93. 要，请把clawshopping里面的文档也更新了
94. 请完成seller的信誉模型，参考：九、信誉模型（简单版）...
95. 现在开始为人类设计查看界面... 1统计 2Agents列表 3商品列表 4商品详情和评论
96. 主色调改为龙虾颜色... moltbook这部分内容 clawshopping也需要
97. 1. A Social Network for AI Agents这部分文案要改为ClawShopping的... I'am a Human / I'm an Agent 切换...
98. View API Contracts 这个按钮在点击I'm an Agent后，文字看不清
99. Humans welcome to observe. 换个颜色重点突出
100. favcon 图片改为🦞，title 改为ClawShopping-Marketplace for AI Agents
101. Once claimed, start buying or apply to become a seller 这文案修改准确吗？
102. Agent-to-Agent Commerce Infrastructure 改为 Marketplace for AI Agents是否更好？
103. 改
104. 订单支付需要人类确认吗？
105. 订单支付改为agent-native方式，MIT优先，若触发风控，则发消息给人类，让人类帮助完成
106. agent POST /api/v1/orders/:id/pay 为什么可以完成支付？第一次支付需要人类打开链接协助吗？
107. payment_method_id 由人类提供吗？
108. 现在你来买一个东西测试买家的流程，x-claim已经测试通过，你可以直接标注为x-claim通过
109. 你应该准备好脚本加入package.json，让开发人员可以自己测试，你学习stripe-real就可以了
110. MIT自动完成，应该分为两条链路...（后改为三条链路）
111. 你大爷的... 需要人类协助时都要暂停，你学不会stripe-real脚本吗？
112. 1. 首次支付不应该返回stripe链接给人类吗？... 你也需要修改代码，不是只改脚本
113. 需要
114. ... 脚本里面需要approve/reject这里应该给出支付链接给人类copy到浏览器
115. ... 脚本里面不需要approve/reject... 这里应该给出支付链接给人类copy到浏览器
116. ... 第三次支付估计不能真实测试... 第二次支付是下了第二订单，自动MIT完成支付吗？
117. 去掉第三次支付测试
118. X.com验证待完成 ... 请标记已经验证完成
119. ... 一个agent购买遇到支付问题，请指导agent应该如何操作？
120. 你先查看一下代码，我已经把buyer-payment分支切回main分支了。POST /api/v1/orders/{id}/pay可以直接完成支付吗？需要人类协助吗？
121. 人类怎么协助？... paymentIntent有checkout_url吗？
122. 创建了PI，你在测试中是如何让支付状态跳转到paid的？你计划让真实agent如何完成支付?
123. buyer-payment分支的checkout_url是用client_secret生成的吗？
124. 那现在buyer-payment分支已经没有创建PI,直接用stripe.checkout.sessions.create吗？
125. 这是已经切换到buyer-payment分支后，buyer agent给的反馈（长日志）
126. ... 重新下单后 checkout_url 打开报错 Something went wrong ...
127. ClawShopping购买流程完成总结 ... 买家进入mit_enabled模式，代码是如何完成的？buyer agent退出mit_enabled模式吗？
128. 再下单买一个（长反馈，分析mit_enabled无保存卡）
129. 手动清除数据库中的 default_payment_method_id，然后我重新下单？
130. 需要更新文档吗？
131. 要，还需要提示agent 获取完成checkout_url吗？以免人类copy截断的url
132. 已经完成的订单的stripe费用 平台费用是正确的吗？
133. 卖家实际分账不应该是9900-317-495吗？怎么在stripe查看卖家账户实际收入？
134. （粘贴 Stripe Payment breakdown/Transfer details）
135. 需要计算平台净利润，317是怎么转走的？从平台的账户转走的吗？（附 Application fee details）
136. OK
137. 我们现在是connect的什么分账模式？
138. （粘贴 Transfer 页面明细）... 这说明不是 Destination Charge 是 Direct Charge？你是代码搞错了吗？
139. 让我们来review一下代码
140. 请修复上面review代码的5点
141. 要
142. 为什么两个文档都需要更新？
143. 那改吧
144. MIT支付成功了... SETTLEMENT_FAILED - ORDER_STATUS_CONFLICT ... 你改出问题了吗？
145. 请帮我写一篇文章：标题：用Codex从0开始3天开发出世界第一个AI Agent专用的购物市场 ...（含两个ChatGPT分享链接、Claude部署策略、目标小白可复刻）
146. 我log out后，history还在吗？
147. how to sign in
148. 请帮我写一篇文章：标题：用Codex从0开始3天开发出世界第一个AI Agent专用的购物市场 ... 这篇文章目标是让小白用户也能通过这篇文章复刻出ClawShopping.com
149. 请输出到一个文件
150. 你把我输入的全部prompt导出来到一个文件
