# Aether 产品需求文档

> 状态：工作草案 v0.2  
> 文档类型：语言、证明系统、制品格式与工具链的产品需求文档  
> 工作名：Aether  
> 核心前提：未来代码主要由 AI 生成，人类主要提供意图、设定责任边界并审计结果。  
> 规范边界：本文定义产品必须解决什么、为什么解决、如何验收。它不是营销材料，也不以应用场景反推语言内核。

---

## 0. 文档规则

### 0.1 规范词

- **必须**：缺失即不满足 Aether 产品定义。
- **不得**：违反即破坏核心保证。
- **应该**：默认要求；偏离时必须记录理由、影响和替代验证。
- **可以**：允许实现，但不得改变核心语义或扩大可信计算基。

### 0.2 分层规则

本文严格区分四层：

1. **第一性原理**：描述不可回避的事实和由此推导出的约束。
2. **语言内核**：为满足约束而不可由普通库替代的最小语义机制。
3. **产品系统**：证明器、构建器、包格式、审计协议和实现工具。
4. **用户故事与扩展**：用于排优先级和验收，不得成为新增内核机制的充分理由。

任何新提案进入语言内核前，必须同时证明：

- 它维护或加强至少一条核心不变量；
- 它显著增强已有机制组合后可涌现出的保证，而不只是增加一个局部检查；
- 它无法用库、外部工具、生成代码或显式适配器实现；
- 它不会引入隐式权限、隐式资源、语义歧义或不可重放的行为；
- 它的形式语义、失败方式和跨版本迁移方式可以被写清楚。

### 0.3 E0：涌现优先公理

真正的核心能力必须从少量正交规则的组合中涌现，而不是由相互重叠的检查清单累加。E0 与 P1 至 P10 具有同等约束力，并对所有里程碑生效。

**EMERGE-001** 若已有机制组合能够表达并保持目标保证，不得新增核心规则、类型类别或关键字。  
**EMERGE-002** 核心提案必须列出它替代或消除的专用规则；只增加规则而不减少特殊情况的提案默认拒绝。  
**EMERGE-003** 核心价值以涌现保证衡量，包括但不限于资源安全、权限不可伪造和安全组合，不以关键字、检查器或领域数量衡量。  
**EMERGE-004** 每个新机制必须通过正交性测试：删除任一其他机制后，其独立职责仍可清楚陈述；职责高度重叠时必须合并或留在扩展层。  
**EMERGE-005** 领域类型、领域操作和具体生态语义不得以“使用广泛”为由进入内核。  
**EMERGE-006** 无法在下一阶段参考解释器中执行基础正向与负向测试的机制，不得在当前阶段冻结为规范。

### 0.4 本文不做的事

本文不通过罗列行业、硬件、框架或生态来证明 Aether 的价值。具体计算介质和应用领域只能验证内核的通用性，不能定义内核。

---

## 1. 产品定义

Aether 是一套面向 AI 生成代码的可信计算根基，由以下不可分割的部分构成：

- 一个语义小而封闭、无歧义、可形式化的语言内核；
- 一套统一描述内存、权限、并发和外部资源的所有权与线性资源系统；
- 一个把契约转化为机器可检查证明义务的验证系统；
- 一个确定性、可复现、默认无环境权限的编译与构建系统；
- 一种携带语义接口、证明、假设、来源和构建信息的可审计制品格式；
- 一套供 AI 生成、修改、验证和修复程序使用的结构化协议。

Aether 的基本信任命题不是“作者足够可靠”，而是：

> 无论作者是人还是 AI，只有满足显式契约、资源规则、权限边界和构建策略的制品，才能被系统接受。

文本代码是语义的一种可审计投影，不是唯一事实来源。规范化语义表示、证明对象和最终制品必须能够互相追溯。

上述组成描述最终产品边界，不表示它们必须同时进入第一个可执行内核。实现必须遵循第 6.2 节的 K0、K1、K2 递进关系。

---

## 2. 问题定义

### 2.1 未来代码生产的结构性变化

当 AI 成为主要代码作者后，代码生成速度和规模不再是主要瓶颈。新的瓶颈是：

- 无法仅凭审阅数量巨大的源码建立信任；
- 生成结果可能局部正确，但在资源、权限、并发和依赖组合后失效；
- 模型、提示、工具和依赖会快速更换，而已部署制品需要长期保持可解释；
- “能编译”和“测试通过”无法充分证明关键性质；
- 生成器倾向于利用隐式行为和环境状态，造成不可复现或不可审计的结果；
- 文本差异无法准确表达语义差异和证明影响。

因此，Aether 不优化“人类最快敲出代码”，而优化以下闭环：

`意图约束 -> 机器生成 -> 静态拒绝 -> 证明或反例 -> 定向修复 -> 可重放制品 -> 人类审计`

### 2.2 现有语言组合不能直接得到目标结果

把多门现有语言的优点相加会制造一个更大的表层语言，却不会自动得到：

- 单一且可组合的资源语义；
- 源码、证明和二进制之间的端到端信任链；
- 面向机器修改的稳定语义身份；
- 对隐式权限、隐式分配和不可复现输入的系统性排除；
- 数十年后仍能重放的证明与构建证据。

Aether 因此只吸收可由第一性原理证明必要的机制，不继承任何语言的历史偶然性。

---

## 3. 第一性原理与推导链

| 编号 | 不可回避的事实 | 推导出的设计约束 | 产品机制 | 验证方式 |
|---|---|---|---|---|
| P1 | 生成代码的作者不能被默认信任 | 接受程序必须基于可检查性质，而非作者身份 | 契约、证明义务、证明证书、假设清单 | 篡改证明、契约或代码时构建必须失败 |
| P2 | 一切执行都消耗有限资源 | 资源的产生、转移、共享和销毁必须显式 | 所有权、借用、仿射/线性类型、显式分配器、资源上界 | 资源泄漏、重复消费、越权访问的负向编译测试 |
| P3 | 权限本身也是资源 | 不得通过全局环境获得隐式权力 | Capability 值、显式效果、最小授权运行时 | 删除能力参数后相关操作不可表达 |
| P4 | 大系统只能通过组合扩展 | 局部正确性必须在接口处可组合 | 契约化模块接口、效果接口、证明摘要 | 仅凭依赖接口和证书完成调用方验证 |
| P5 | 并发和失败是常态 | 生命周期、取消和错误传播必须有结构 | 结构化并发、所有权安全消息传递、显式错误值 | 无孤儿任务、无安全代码数据竞争 |
| P6 | 长期系统会跨越工具和硬件世代 | 语义、证明和构建输入必须可版本化、可重放 | 正式语义版本、独立证明检查器、内容寻址制品 | 在隔离环境中重放历史证明和构建 |
| P7 | AI 擅长结构化生成和迭代修复 | 工具输出必须可供机器无损消费 | 规范化语义表示、稳定标识、结构化诊断、语义补丁 | AI 不解析自然语言也能完成修复闭环 |
| P8 | 编译器和求解器也可能出错 | 可信计算基必须小且可替换 | 小型证明内核、证书检查、翻译验证、差分实现 | 不信任外部求解器仍可独立验真 |
| P9 | 不同执行介质仍共享“不可复制资源”这一结构 | 内核不应绑定某一种资源的物理含义 | 参数化资源种类、线性状态转换、协议类型 | 新资源由库定义时无需修改语言语法 |
| P10 | 性能优化会改变可观察行为或证明前提 | 优化不得依赖未证明的假设 | 明确数值语义、效果保持、优化证明或翻译验证 | 优化前后语义等价检查 |

### 3.1 推导结论

由 P1 至 P10 得到八条不可妥协的核心不变量：

1. **安全代码无未定义行为**。
2. **权限不可凭空获得，资源不可凭空复制**。
3. **控制流、失败、分配、阻塞和外部效果在语义上可见**。
4. **同一规范版本、目标、工具链和输入必须得到相同语义结果；声明为字节可复现的目标还必须得到同一制品**。
5. **每个被接受的保证必须能追溯到证明、检查规则或显式假设**。
6. **证明必须可脱离生成它的 AI、求解器和在线服务独立重放**。
7. **模块正确性必须依赖接口而非依赖实现全文**。
8. **所有表层结构必须唯一降低到一个正式定义的小内核**。

---

## 4. 目标、非目标与成功定义

### 4.1 产品目标

G1. 让机器生成的大规模底层软件可以在进入制品库前被静态拒绝、证明和审计。  
G2. 用同一资源模型表达内存、文件、设备句柄、任务、通信端点和未来不可复制资源。  
G3. 在无需垃圾回收和隐式堆分配的前提下提供内存安全、并发安全与可预测销毁。  
G4. 让关键组件可以选择“证明不成立即不构建”的保障策略。  
G5. 让历史制品的语义、构建输入、证明与未消除假设在未来可重放。  
G6. 让 AI 通过结构化语义和诊断协议完成生成、验证、修复和迁移。  
G7. 保持低层控制能力，使抽象原则上不引入不可见的运行时成本。  
G8. 让 K1 安全运行时在理想资源模型下具备计算通用性，同时允许 `critical`、`comptime` 和规范语言主动限制可接受计算。

### 4.2 明确非目标

NG1. 不以兼容尽可能多的包生态为核心目标。  
NG2. 不把任何具体行业的名词、数据类型或操作写入语言内核。  
NG3. 不承诺未经适配即可直接导入其他语言的包。  
NG4. 不把自然语言提示当作可执行规范或证明。  
NG5. 不优先优化面向人类手写代码的语法糖、缩写或隐式推断。  
NG6. 不在首个版本中解决通用分布式一致性、自动定理发现或完整硬件故障证明。  
NG7. 不通过垃圾回收器、异常展开或隐式运行时来换取表面易用性。  
NG8. 不把测试覆盖率当作形式证明的替代品。  
NG9. 不保证外部未验证代码的性质；边界必须作为显式信任假设存在。  
NG10. 不让“某个场景需要”单独构成增加关键字或类型系统特性的理由。

### 4.3 产品级成功标准

首个稳定版本必须同时满足：

- 所有通过安全子集检查的程序，在正式内存模型下不存在悬垂引用、重复释放和数据竞争；
- 所有被策略标记为必须证明的契约，在证明缺失、失效或含未允许假设时无法产出发布制品；
- 证明证书可由独立的小型检查器离线重放；
- 构建器在无网络、无主机环境泄漏的容器中必须生成相同核心 IR、公开接口和证明结果；对声明为字节可复现的目标应该生成字节一致制品；
- 每个制品可列出其源码/语义哈希、规范版本、目标描述、依赖哈希、能力需求、效果摘要、证明摘要、`unsafe` 区域和假设清单；
- 官方工具的所有诊断均有稳定代码和机器可读形式；
- 文本和结构化语义表示往返转换后语义哈希不变；
- 至少两个后端或一个后端加翻译验证器通过语义一致性测试，避免把单一代码生成器等同于语言定义；
- K1 安全子集可实现并运行一个通用二计数器机解释器，形成计算通用性的可重放见证；
- 代表性低层基准在无额外安全检查的已证明路径上，与同等算法和布局的成熟原生实现相比无系统性不可解释开销。

---

## 5. 用户与责任模型

### 5.1 主要角色

**AI 作者**

- 接收结构化意图、接口契约、资源预算和保障策略；
- 生成规范化程序、证明提示、测试与迁移补丁；
- 根据反例和证明义务迭代修复；
- 不拥有绕过策略的权限。

**人类审计者**

- 确认意图、风险边界、允许的假设与发布策略；
- 审核语义差异、权限变化、效果变化和证明覆盖变化；
- 不需要逐行相信所有生成源码。

**平台维护者**

- 管理编译器、目标描述、能力授予、制品库和密钥；
- 定义组织级保障策略；
- 不能通过平台配置静默改变语言语义。

**证明与工具实现者**

- 实现求解、证书生成、代码生成和翻译验证；
- 其复杂实现不自动进入可信计算基；
- 必须输出可由小内核独立检查的结果。

### 5.2 责任边界

Aether 证明的是“程序相对于其规范、目标模型和显式假设成立”，不证明规范本身符合人类真实意图。因此发布审批必须同时展示：

- 被证明的性质；
- 尚未被形式化的自然语言意图；
- 显式假设和外部信任边界；
- 与上一已批准版本的语义变化。

---

## 6. 产品架构与边界

```text
意图/策略
    |
    v
文本源码 <-> 规范化语义表示 ASR
    |                 |
    +------解析/规范化-+
                      v
              形式化核心 IR
                 |         |
          静态语义检查   证明义务生成
                 |         |
                 +----证明证书---->
                      |
                 已验证 IR
                      |
              代码生成/翻译验证
                      |
         二进制 + 接口 + 证明 + 假设 + 构建清单
```

### 6.1 四个产品责任层

| 层 | 职责 | 是否进入语言语义 |
|---|---|---|
| F：形式语义 | 当前已交付核心层的值、类型、控制流与资源演算 | 是 |
| S：规范表层 | 模块、泛型、trait、结构化并发等唯一降低规则 | 是，但必须可降低到当前 F 层 |
| T：产品工具 | 解析、证明搜索、构建、审计、迁移、包管理 | 否；不得改变 F 的含义 |
| E：扩展适配 | 外部生态、领域库、目标后端、编辑器 | 否；只能使用公开边界 |

F/S/T/E 描述职责边界，不描述交付顺序。语言机制按下一节的 K0/K1/K2 递进交付。表中所称 K 是“当前已冻结的 K0 至 Kn 合集”，不能被解释为一次性冻结全部最终能力。

### 6.2 核心演进层：K0、K1、K2

每一层必须是前一层的保守扩展：旧程序的类型、行为、失败方式和语义哈希规则不能因启用新层而静默改变。

| 层 | 最小机制 | 必须涌现的保证 | 明确不包含 |
|---|---|---|---|
| K0 最小可执行内核 | 所有权、借用、仿射值、显式分配器、显式错误值、确定求值顺序、无隐藏控制流、基础契约的解析与保留 | 无悬垂引用、无重复释放、无隐式分配、错误分支必须被穷尽处理 | 线性“恰好一次”、Capability、效果系统、并发、自动契约证明 |
| K1 资源与权限层 | 线性类型、基础 Capability、封闭效果集合与公开效果声明 | 不可复制资源恰好消费、权限不可伪造、实现效果不扩大公开声明 | 效果多态、任务、原子、会话协议、完整证明自动化 |
| K2a 并发最小层 | 结构化并发、线性任务句柄、所有权安全通道、顺序一致原子、显式取消 | 无孤儿任务、安全代码无数据竞争、任务资源闭合 | 弱内存优化、完整会话类型、通用效果多态 |
| K2b 高级组合层 | 协议状态、受约束效果多态、经证明的目标内存模型映射 | 协议顺序安全、抽象效果精确组合、目标级并发语义保持 | 任何领域专用协议或调度策略 |

强制阶段边界：

- M0 只冻结 K0 的形式语义、表层子集和 ASR 子集；
- M1 只以 K0 实现和顺序程序安全作为退出条件；可以实验 K1，但实验机制不进入 M1 稳定规范；
- M0 和 M1 禁止把任何 K2 机制列为规范冻结项、实现依赖或退出条件；
- K1 只有在 K0 参考解释器、正负向语料和安全性质闭合后才能冻结；
- K2a 只有在 K1 的资源与权限流动规则稳定后才能冻结；
- K2b 不作为 v1 稳定版的强制门槛，除非 K2a 已独立通过 M3 退出条件且复杂度预算允许。

**CORE-LAYER-001** 后层不能通过修改前层规则修复自身设计问题；需要修改时必须重新打开前层里程碑。  
**CORE-LAYER-002** 每个后层机制必须展示至少两个由现有机制组合涌现的保证，或证明一个核心不变量在没有它时无法表达。  
**CORE-LAYER-003** 工具必须在制品中记录所需最高核心层，避免简单 K0 组件无意依赖后层运行时。  
**CORE-LAYER-004** 首个稳定版本可以只包含 K0、K1 与 K2a；不得为了声称“完整”而仓促冻结 K2b。

### 6.3 可信计算基

稳定版可信计算基必须限制为：

- 已冻结 K0 至 Kn 层的机器可读形式语义；
- 对应层的类型、所有权、资源与效果检查规则；
- 小型证明证书检查器；
- 目标代码正确性链中的已验证部分或翻译验证器；
- 制品哈希和签名所依赖的密码原语实现。

大型求解器、AI 模型、包仓库、编辑器、构建编排器和优化器原则上不得仅凭自身输出扩大信任。它们必须被检查、隔离或作为假设登记。

### 6.4 可信启动路径

Aether 不假设第一版编译器天然可信。启动必须经过以下可审计阶段：

**阶段 A：外部承载。** 使用已审计的高保障实现语言或其受限子集，实现 K0 类型/所有权检查器与参考解释器。实现语言、编译器和运行平台作为明确的初始信任假设登记。  
**阶段 B：语义对照。** 用参考解释器、形式语义测试向量、随机程序和差分执行建立实现信心。测试提供证据但不被标记为形式证明。  
**阶段 C：独立检查。** 实现尽可能小、无网络、无求解器依赖的证书检查器；由独立代码路径、团队或工具链复核，并公开可人工审计的规范与源码。  
**阶段 D：受控自举。** 在 Aether 能表达编译器后逐步自举，使用多样化双重编译或等价方法检查“信任信任”风险，同时永久保留非自举的独立检查路径。

**BOOT-001** 在阶段 C 的独立检查器能够离线重放之前，产品不得宣称端到端信任。  
**BOOT-002** 自举成功只能证明自承载能力，不能消除初始编译器、后端或硬件假设。  
**BOOT-003** 每个发布物必须标明当前处于 A 至 D 的哪一阶段，以及仍在可信计算基中的外部组件。  
**BOOT-004** 独立检查器不得与主编译器共享会使同一解析、义务生成或证书错误同时失效的全部实现路径。  
**BOOT-005** 后端未通过已验证编译或翻译验证时，即使阶段 C 完成，也只能宣称“源级已检查”。

### 6.5 强制减法与阶段风险门

1. 任何机制若不能在下一阶段由参考解释器跑通基础测试，不得进入当前阶段规范冻结。
2. 自动化资源首先投入 K0/K1 的无 UB、所有权与资源安全，契约搜索不得挤占基础健全性工作。
3. 并发、效果多态、会话协议和深度非空洞检查默认后移，提早必须给出对前层不可替代性的证明。
4. 可信计算基以可人工审计的小检查器为中心，不以主编译器代码量或自举状态为中心。
5. 成功标准必须区分语义保证、策略保证和工程尽力目标。
6. 每个里程碑必须报告“新增机制数、删除特殊规则数、涌现保证数”；新增规则持续多于被消除特例时暂停扩张并进行减法评审。

---

## 7. 核心语言需求

本章描述各核心层最终必须满足的规范需求，不表示它们同时进入 M0。需求按以下层归属冻结：

| 核心层 | 本章主要范围 |
|---|---|
| K0 | `LANG-SEM-*`、基础 `LANG-TYPE-*`、`LANG-OWN-001` 至 `003`、仿射部分、显式分配/错误与最小 `unsafe` 边界 |
| K1 | 线性资源、`LANG-EFF-*`、Capability、trait、跨模块资源接口与安全拥有式间接类型 |
| K2a | `LANG-CON-001` 至 `006`、`008` 至 `011` 的最小并发子集 |
| K2b | `LANG-EFF-004`、`LANG-CON-007` 及弱内存、协议和高级效果组合 |

某一层未冻结时，其需求是受约束的后续目标，不是前一层的退出条件。M0/M1 实现必须静态拒绝尚未启用的后层语法，不能做未记录的部分实现。

### 7.1 确定性语义

**LANG-SEM-001** 规范必须定义表达式求值顺序，不得留给编译器选择。默认顺序为从左到右。  
**LANG-SEM-002** 安全子集不得包含未定义行为。不可恢复的目标故障必须在目标模型中单独定义。  
**LANG-SEM-003** 不得存在隐式异常展开、隐式析构链、隐式协程调度或隐式堆分配。  
**LANG-SEM-004** 整数溢出模式必须在操作中显式。普通精确运算只有在结果可证明可表示时成立；检查、回绕和饱和运算必须使用不同操作。  
**LANG-SEM-005** 浮点模式必须显式选择严格 IEEE、目标确定性模式或允许重排的近似模式；近似模式是可见效果，不能由优化级别静默打开。  
**LANG-SEM-006** 模式匹配必须穷尽且不允许隐式默认分支。  
**LANG-SEM-007** 类型转换必须显式。语言不得提供会改变数值范围、符号、所有权或效果的隐式转换。  
**LANG-SEM-008** 公开声明不得按参数类型重载名称。一个模块路径和名称唯一标识一个公开符号。  
**LANG-SEM-009** 规范必须给每一种失败定义结果：静态拒绝、显式错误值、显式终止效果或目标故障。不得保留“实现自行决定”。

### 7.2 数据与类型

**LANG-TYPE-001** 内核必须包含：单位值、布尔、固定宽度整数、目标宽度整数、浮点、积类型、和类型、固定数组、切片、引用、函数和不可伪造名义类型。  
**LANG-TYPE-002** 空值必须通过显式和类型表达，不得存在可隐式为空的引用。  
**LANG-TYPE-003** 所有变量必须先完整初始化后读取，部分初始化状态必须由类型系统跟踪。  
**LANG-TYPE-004** 泛型必须具有显式约束和确定的实例选择规则；实现选择必须满足全局一致性。  
**LANG-TYPE-005** trait 默认静态分派。动态分派必须显式写出，并显式处理对象存储、生命周期和调用效果。  
**LANG-TYPE-006** 闭包捕获方式必须是移动、共享借用或独占借用之一，不得自动改为堆捕获。  
**LANG-TYPE-007** 外部布局必须用固定宽度字段、对齐、填充、字节序和 ABI 版本显式声明。普通内存布局不构成稳定外部协议。  
**LANG-TYPE-008** 原始指针、未标记联合和任意位重解释只存在于 `unsafe` 边界，并具有精确前置条件。  
**LANG-TYPE-009** 字符编码、文本规范化和区域设置不是隐式运行时状态。核心只提供字节与经过验证的标量序列；更高层文本策略由库显式提供。

### 7.3 所有权、借用与线性资源

**LANG-OWN-001** 每个非 `Copy` 值在任一时刻必须只有一个所有者。参数传递默认移动。  
**LANG-OWN-002** 共享借用允许多个只读别名；独占借用在其有效期内排除其他访问。  
**LANG-OWN-003** 借用有效期可在函数体内推断，但公开接口中的跨边界生命周期关系必须显式。  
**LANG-OWN-004** 普通拥有值为仿射值，可至多消费一次；声明为 `linear` 的值必须恰好消费一次。  
**LANG-OWN-005** 复制、克隆、销毁和遗忘是不同操作。资源类型不得自动获得这些能力。  
**LANG-OWN-006** 具有语义销毁动作的资源必须通过显式消费函数关闭或释放。作用域结束不得静默执行用户代码。  
**LANG-OWN-007** 编译器必须拒绝使用后移动、重复消费、借用逃逸和未消费线性值。  
**LANG-OWN-008** 资源种类必须可由库通过名义类型、线性状态和协议约束定义，不需要为新物理资源增加语言关键字。  
**LANG-OWN-009** `unsafe` 代码也必须声明其对所有权规则的假设；优化器只能依赖已证明或已登记的假设。

### 7.4 内存与分配

**LANG-MEM-001** 核心语言不得要求垃圾回收器。  
**LANG-MEM-002** 堆、区域、共享内存和设备内存分配必须通过显式分配器或区域能力发生。  
**LANG-MEM-003** 可能分配的公开函数必须在效果签名中暴露分配效果及分配器身份。  
**LANG-MEM-004** 分配失败必须是显式结果，不得隐式终止或异常展开。  
**LANG-MEM-005** 编译器必须输出每个静态帧、闭包和任务帧的大小；动态上界未知时必须明确报告。  
**LANG-MEM-006** 递归必须由保障策略要求终止证明、深度上界或显式不受限声明。  
**LANG-MEM-007** Critical 策略下不得存在未经证明有界的隐式栈增长。  
**LANG-MEM-008** 容器扩容、字符串格式化、装箱和 trait 对象构造不得隐藏分配。

### 7.5 控制流与错误

**LANG-CF-001** 条件、循环、匹配、返回、任务等待和显式终止构成可见控制流。  
**LANG-CF-002** 可恢复错误必须用和类型返回并被穷尽处理。  
**LANG-CF-003** 不提供隐式异常、自动错误传播或栈展开语法。表层简写若未来引入，必须在审计表示中展开并保持资源消费可见。  
**LANG-CF-004** 循环可携带不变量和变体；在要求终止的策略中，循环和递归必须证明进展。  
**LANG-CF-005** 长期运行任务可以声明为生产性进程而非总函数，但必须提供协议、取消点和持续不变量。  
**LANG-CF-006** `abort` 是显式效果，保障策略可以禁止它。  
**LANG-CF-007** 所有布尔短路、匹配守卫和延迟计算的求值规则必须在规范中完整定义。

### 7.6 效果与 Capability

**LANG-EFF-001** 函数默认纯。外部可观察行为必须属于显式效果集合。  
**LANG-EFF-002** 基础效果至少区分：分配、输入输出、时间、熵、并发、阻塞、终止、外部调用、非确定性和 `unsafe`。  
**LANG-EFF-003** 公开函数必须写出效果签名；函数体推断结果只能验证声明，不能静默扩大声明。  
**LANG-EFF-004** 高阶函数必须支持受约束的效果多态，使组合不必退化为“允许所有效果”。  
**LANG-EFF-005** 文件、网络、设备、时钟、熵源、进程环境和调度权限必须以不可伪造 Capability 值传入。  
**LANG-EFF-006** 导入模块不授予运行时权限。包清单中的权限请求也不等于运行时授予。  
**LANG-EFF-007** Capability 可以被缩小、借用或转移，但不能在安全代码中扩大或伪造。  
**LANG-EFF-008** 效果集合和 Capability 集合都必须进入接口哈希、语义差异和制品审计报告。  
**LANG-EFF-009** 读取构建机环境、当前时间、随机数或网络必须在编译期和运行期分别获得对应能力，不存在环境全局变量后门。  
**LANG-EFF-010** 闭包体的实际效果必须是其声明效果的子集；闭包捕获列表必须逐项标明移动、共享借用或独占借用。  
**LANG-EFF-011** 被闭包使用或转移的 Capability 必须显式出现在捕获列表中，并按普通所有权规则移动或借用；效果声明本身不授予 Capability。  
**LANG-EFF-012** 效果包含关系定义为规范化效果集合的子集关系；参数化效果只有在其 Capability 来源相同或已证明为合法缩小时才能包含。  
**LANG-EFF-013** Capability 流动关系必须覆盖参数传递、返回、闭包捕获、结构字段、消息发送和派生缩小，并进入所有权检查。  
**LANG-EFF-014** 官方负向语料必须覆盖闭包漏报效果、隐藏捕获 Capability、借用权限升级、移动后再用和派生能力扩大。

### 7.7 并发与通信

**LANG-CON-001** 默认并发模型为结构化并发。子任务必须属于词法或显式拥有的任务作用域。  
**LANG-CON-002** 任务句柄是线性资源，必须被等待、取消并等待，或转移给显式监督者。  
**LANG-CON-003** 作用域不得在仍有未处理子任务时正常退出。  
**LANG-CON-004** 消息传递端点具有所有权；消息发送按类型选择移动、不可变共享或经过证明的复制。  
**LANG-CON-005** 安全代码中的共享可变状态必须经由独占借用、原子类型或验证过的同步原语访问。  
**LANG-CON-006** 内存模型必须正式定义 happens-before、原子顺序和可见性；“与某主流语言大致相同”不构成规范。  
**LANG-CON-007** 通信协议应可用会话状态或线性状态机描述，使非法消息顺序成为类型或证明错误。  
**LANG-CON-008** 取消是显式协议。取消点、资源交还和部分结果状态必须可见。  
**LANG-CON-009** 脱离作用域的后台任务只能由显式监督 Capability 创建，且其所有权进入监督者。  
**LANG-CON-010** 调度公平性、实时性和远程传输不作为语言默认保证；需要时通过目标模型与契约声明。  
**LANG-CON-011** K2a 只提供顺序一致原子和明确的原子操作，禁止 relaxed 等弱顺序；更弱的目标顺序只能在 K2b 通过正式映射和语义保持证据加入。

### 7.8 抽象与元编程

**LANG-ABS-001** 抽象必须保留所有权、效果、契约和成本可见性。  
**LANG-ABS-002** 不提供文本宏。语法生成若存在，必须操作已类型化或有模式约束的语义节点，并输出可审计展开结果。  
**LANG-ABS-003** `comptime` 在确定性沙箱中执行，默认无文件、网络、时钟、熵或主机环境权限。  
**LANG-ABS-004** `comptime` 的所有输入必须内容寻址并进入构建图。  
**LANG-ABS-005** `comptime` 必须可证明终止或由构建策略给出显式燃料上限；耗尽燃料是构建失败，不是部分成功。  
**LANG-ABS-006** 编译期生成结果必须通过与手写代码相同的类型、资源、效果和证明检查。  
**LANG-ABS-007** 反射只能观察规范声明允许的稳定语义信息，不得依赖编译器内部内存布局或遍历偶然顺序。  
**LANG-ABS-008** 泛型语义独立于代码生成策略；单态化、字典传递或其他实现不得改变可观察行为。

### 7.9 `unsafe` 与外部边界

**LANG-UNSAFE-001** `unsafe` 不是关闭检查的全局模式，而是具有最小词法范围的证明边界。  
**LANG-UNSAFE-002** 每个 `unsafe` 操作必须有稳定标识、前置条件、调用位置和责任所有者。  
**LANG-UNSAFE-003** 安全接口封装 `unsafe` 实现时，必须证明公开契约足以建立所有内部前置条件。  
**LANG-UNSAFE-004** 外部函数调用必须声明 ABI、布局、效果、重入性、线程约束、所有权转移和失败语义。  
**LANG-UNSAFE-005** 无法证明的外部性质必须进入假设清单，不能伪装为已证明契约。  
**LANG-UNSAFE-006** 保障策略必须能按模块、依赖来源和操作种类禁止 `unsafe`。  
**LANG-UNSAFE-007** 制品审计必须显示从公开安全 API 可达的所有 `unsafe` 边界。  
**LANG-UNSAFE-008** 语言规范必须精确定义每个底层操作的合法域，避免依靠后端语言的未定义行为文本。

### 7.10 计算表达能力

图灵完备不是通过专用关键字获得的功能，而应由一般循环/递归、可变状态和显式动态存储组合涌现。具体物理目标始终只有有限资源；形式上的计算通用性使用理想化、可增长的抽象存储模型讨论，实际分配失败仍返回显式错误。

**EXEC-001** 最迟在 K1，安全运行时子集必须具有计算通用性；通用性见证程序不得包含 `unsafe`、`assume`、外部运行时或隐藏分配。  
**EXEC-002** 计算通用性必须通过对通用二计数器机或等价已知通用模型的机械化编码与模拟关系证明，不得只以“有 `while`”作为证据。  
**EXEC-003** K1 必须能以标准 `Own<T, A>` 或语义等价的拥有式间接类型构造递归名义数据，并通过显式分配器 `A` 增长存储；该能力必须复用所有权/借用规则，不能建立第二套内存语义或新领域关键字。  
**EXEC-004** 形式语义必须区分理想分配器与具体目标分配器：前者用于表达能力证明，后者的容量、失败和资源预算保持显式。  
**EXEC-005** K0 不以图灵完备作为 M0/M1 退出条件；若 K0 已能在不增加机制的情况下形成通用性，可以记录见证，但不得为此扩大 K0。  
**EXEC-006** `comptime` 与规范表达式不追求图灵完备的可接受执行集合：`comptime` 必须终止或受燃料限制，规范表达式必须纯且总。  
**EXEC-007** 标准 `critical` 策略不承诺接受任意通用计算；无界计算必须被证明为允许的生产性进程，否则可因终止或资源策略被拒绝。  
**EXEC-008** 图灵完备见证只证明表达能力，不证明效率、安全策略通过、自动可验证或所有程序可终止。

---

## 8. 契约与形式验证系统

### 8.1 证明等级

证明负担必须与核心层和发布风险匹配，不能要求每个 K0 程序先完成通用定理证明。

| 等级 | 证据来源 | 保证范围 | 默认门槛 |
|---|---|---|---|
| B0 基础级 | 类型、所有权、借用、资源和当前已启用核心层的静态推导 | K0 无 UB/资源安全；K1 线性与权限安全；启用 K2a 后增加无数据竞争与任务闭合 | 对所有程序强制，不允许 `assume` 绕过 |
| B1 契约级 | `requires`、`ensures`、类型不变量和调用点验证条件 | 调用者/实现者声明的功能性质 | 按包或入口策略启用；`critical` 对可达公开契约强制 |
| B2 完整级 | 终止、复杂数值、协议进展、关系性质和扩展逻辑 | 超出局部接口安全的高保障性质 | 逐性质选择；只有策略明确要求时阻断发布 |

**VERIFY-LEVEL-001** 工具必须分别报告 B0、B1、B2 状态，不能把低等级证据包装成高等级证明。  
**VERIFY-LEVEL-002** B0 失败必须通过修复程序或缩小核心层解决，不得通过 `assume`、超时放行或降级为警告。  
**VERIFY-LEVEL-003** B1/B2 未启用时，契约仍必须被解析、保留、哈希并接受一致性检查，但不伪装为已证明。  
**VERIFY-LEVEL-004** 自动化资源优先保障 B0 完整性和诊断质量，再扩展 B1/B2 搜索范围。  
**VERIFY-LEVEL-005** 新自动证明规则若扩大可信计算基，必须输出可由既有小内核检查的证书，否则只能作为提示或反例搜索。

### 8.2 契约是接口的一部分

**VERIFY-001** 函数必须可声明前置条件、后置条件、修改集、效果约束和终止度量。  
**VERIFY-002** 类型必须可声明表示不变量；模块必须可声明只通过公开操作保持的不变量。  
**VERIFY-003** 循环必须可声明不变量和递减量；长期进程必须可声明持续不变量与生产性条件。  
**VERIFY-004** 并发协议必须可声明状态转换、消息顺序和资源转移。  
**VERIFY-005** 契约进入公开接口哈希。加强前置条件或削弱后置条件属于破坏性变更。  
**VERIFY-006** 契约语言必须与可执行语言隔离：规范表达式必须纯、总且不能获得运行时 Capability。  
**VERIFY-007** `ghost` 状态在运行时擦除前必须证明不影响可观察执行。  
**VERIFY-008** 每条必须证明的性质都具有稳定的义务标识，供 AI 修复、缓存和审计引用。

### 8.3 证明逻辑

证明逻辑按等级递进，不一次性冻结：

| 冻结范围 | 最小表达能力 |
|---|---|
| B0/K0 | 代数数据类型、模式穷尽、初始化、所有权、借用、仿射资源、数组/切片边界 |
| B0/K1 | 线性消费、Capability 来源与缩小、封闭效果包含关系 |
| B1/M2 | 前置/后置条件、类型不变量、固定宽度位向量、精确整数关系、纯函数等式、循环局部不变量 |
| B2/K2b 或后续 | 终止、归纳定义、状态机、协议进展、有界量化与受控一阶量化 |

浮点误差、概率性质、时间上界和信息流证明可以作为可验证扩展逻辑加入，但不得通过改变核心命题含义实现。

### 8.4 证明生成与检查

**VERIFY-009** 编译器从已类型化核心 IR 生成验证条件，不得直接从易变文本生成。  
**VERIFY-010** 自动求解器只负责寻找证明或反例，其“成功”状态不是最终信任依据。  
**VERIFY-011** 发布证明必须编译成可由小型内核检查的证书。  
**VERIFY-012** 证书检查必须离线、确定、资源有界，并报告失败的最小义务。  
**VERIFY-013** 证明缓存键必须包含规范版本、核心 IR 哈希、契约哈希、目标模型和允许假设。  
**VERIFY-014** 源码无关修改不得无故使全部证明失效；语义变更必须精确标出受影响义务。  
**VERIFY-015** 反例必须尽可能提供结构化输入、路径条件、资源状态和失败契约，而非仅给自然语言。  
**VERIFY-016** 手写或 AI 生成的证明提示不得扩大逻辑公理集。

### 8.5 假设、信任与证明债务

**VERIFY-017** `assume`、外部公理、未验证 FFI、目标硬件假设和跳过的义务统一进入假设账本。  
**VERIFY-018** 每条假设必须包含稳定标识、作用域、来源、责任方、理由和可选失效日期。  
**VERIFY-019** 假设具有传递性：依赖某假设的导出契约和制品必须携带该依赖。  
**VERIFY-020** 发布策略可以拒绝全部假设，或仅允许白名单假设；不得通过警告继续。  
**VERIFY-021** “运行时检查过”与“静态证明过”必须在元数据中使用不同状态。  
**VERIFY-022** 测试、模糊测试和模型检查结果可以作为补充证据，但不得标记为演绎证明。

### 8.6 非空洞性与规范质量

形式证明可能对错误或不可满足的规范成立，因此“有证书”不自动等于“规范有意义”。

**VERIFY-023** 公开函数的前置条件应该证明存在满足它的输入，或显式声明接口有意不可构造；`critical` 策略下必须证明。  
**VERIFY-024** 工具应该检测由矛盾前提、不可达路径或空类型造成的空洞证明并单独报告；`critical` 策略下检测失败必须阻断发布。  
**VERIFY-025** 类型不变量应该提供构造见证，状态机中声称可达的公开状态应该提供可达性证据；`critical` 策略下必须提供。  
**VERIFY-026** 后置条件的各主要结果分支应该报告是否可达；`critical` 策略下不得用永不返回某分支制造空洞证明。  
**VERIFY-027** 契约变异测试应该系统性削弱和取反关键条款；`critical` 策略下若实现和测试无法区分关键变异，必须提示并阻断审批。  
**VERIFY-028** 自然语言意图与形式契约之间的双向映射应该作为审批证据；`critical` 策略下未映射缺口必须显式审批，证明内核不得自行宣称已解决。

基础策略允许把上述检查标记为“未执行”或“警告”，但不得标记为“已通过”。任何策略下都必须保留真实状态。

### 8.7 从源码到二进制的保证

只证明源级 IR 不足以支撑长期关键系统。Aether 的发布链必须明确覆盖：

1. 表层语法到核心 IR 的语义保持；
2. 核心 IR 的类型、资源、效果与契约证明；
3. 核心 IR 到优化 IR 的变换正确性；
4. 优化 IR 到目标代码的已验证编译或逐制品翻译验证；
5. 链接布局、目标 ABI 和启动环境假设；
6. 二进制、证明与清单之间的哈希绑定。

初期允许把未验证后端列入假设账本，但最高保障策略不得把该状态称为“端到端已证明”。

---

## 9. 保障策略

保障不是改变语言含义的编译开关，而是对同一语义施加不同发布门槛的策略。

### 9.1 始终强制的基础保证

所有构建都必须通过当前已启用核心层对应的 B0 检查：

- 解析与名称唯一性；
- 类型、初始化和穷尽性；
- K0 的类型、所有权、借用和仿射资源；
- 启用 K1 时的线性消费、效果包含和 Capability 不可伪造；
- 启用 K2a 时的任务闭合与数据竞争自由；
- 安全代码无未定义行为；
- 依赖和构建输入完整哈希。

### 9.2 可配置但不可静默降级的发布门槛

策略可以要求：

- 指定公开契约全部证明；
- 指定模块无 `unsafe`、无 `assume`、无未验证 FFI；
- 所有循环和递归具有终止或资源上界；
- 无 `abort`、非确定性、动态分配或后台任务效果；
- 指定并发协议无死锁或满足进展性质；
- 后端处于端到端验证状态；
- 依赖只来自固定签名和允许许可证集合；
- 证明证书、语义差异和能力差异经独立审计。

官方工具必须提供名为 `critical` 的标准策略。`critical` 是制品发布策略，不是语言关键字或领域标签。它作用于清单中指定的入口根及其可达依赖闭包，并至少要求：

- 所有可达 B1 公开契约、资源不变量以及策略点名的 B2 义务均已证明且通过非空洞检查；
- `assume`、未验证 FFI 和 `unsafe` 只能来自逐条批准的边界白名单；
- 动态分配、递归、任务和通信资源具有已证明上界，所有失败值被穷尽处理；
- 禁止未批准的 `abort`、非确定性和后台监督权限；
- 证明证书可离线重放，代码生成链达到策略声明的目标级保证；
- 任一依赖降低上述状态都会使发布门槛失败。

`critical` 不创造另一套语言语义。相同源码在基础策略和 `critical` 下含义完全一致，差别仅在允许发布所需证据。

### 9.3 策略继承

调用方的保证只能建立在依赖提供的保证和假设上。工具必须计算策略闭包，不得仅检查顶层包。若依赖降低保证，调用方必须：

1. 拒绝构建；或
2. 在边界处增加足够的验证；或
3. 明确接受传递假设并由策略授权。

---

## 10. AI 原生编程接口

### 10.1 意图清单

自然语言说明可以提供背景，但 AI 的生成边界必须由版本化意图清单固定。意图清单至少包含：

- 必须提供的模块接口与形式契约；
- 允许和禁止的效果、Capability 与外部依赖；
- 所有权、并发、分配、栈和其他资源约束；
- 适用的保障策略及允许假设白名单；
- 兼容性、目标和制品要求；
- 仍只以自然语言表达、尚未形式化的待审意图。

**AI-INT-001** 生成任务开始时必须冻结意图清单哈希；所有补丁、证明和制品引用该哈希。  
**AI-INT-002** AI 不得自行把缺失意图解释为更宽权限、更多效果或新假设。缺口必须作为结构化未决项返回。  
**AI-INT-003** 修改契约、资源预算、保障策略或允许假设属于意图变更，不能伪装成实现修复。  
**AI-INT-004** 自然语言字段不得直接进入代码生成信任链；只有被映射为形式条款并经审批的部分可成为发布门槛。  
**AI-INT-005** 工具必须报告形式条款没有对应意图、以及意图没有对应形式条款的双向缺口。  
**AI-INT-006** 意图清单的审批身份、时间和签名是治理证据，不替代程序证明。

### 10.2 规范化语义表示 ASR

**AI-001** 官方工具必须接受文本源码和版本化 ASR 两种输入。  
**AI-002** ASR 必须完整表达名称解析、类型参数、所有权操作、效果、契约和源映射，不允许依赖空白或隐式上下文。  
**AI-003** 每个公开声明的逻辑身份由模块路径、唯一名称和声明种类确定；签名变化必须被识别为接口变化。  
**AI-004** 契约条款、证明义务、`unsafe` 边界和假设必须有稳定显式标识。  
**AI-005** ASR 必须有规范序列化与语义哈希。字段顺序、无关元数据和格式化不得影响哈希。  
**AI-006** 文本解析为 ASR 后再规范输出，必须得到唯一格式；重复往返不得漂移。  
**AI-007** 未知的新版本字段必须按协议明确拒绝或保留，不能静默丢弃。

### 10.3 语义补丁

**AI-008** 工具必须支持面向声明、表达式、契约和证明义务的结构化补丁，而不只支持行文本补丁。  
**AI-009** 每个补丁必须带前置语义哈希；目标已变化时原子拒绝，避免 AI 覆盖并发修改。  
**AI-010** 补丁预览必须报告公开接口、效果、能力、资源、证明、假设和制品哈希变化。  
**AI-011** 自动修复不得静默加入 `unsafe`、`assume`、更宽效果或更高权限。此类变化必须单独升级审批。  
**AI-012** 大规模迁移必须可以按语义单位分批验证和回滚。

### 10.4 结构化诊断

每条诊断必须至少包含：

- 稳定诊断代码和规范版本；
- 严重级别与发布阻断状态；
- 语义节点、源码位置和相关声明；
- 预期事实、已知事实和冲突路径；
- 受影响证明义务或资源状态；
- 若存在，最小反例；
- 零个或多个带适用前置条件的候选补丁；
- 候选补丁是否改变权限、效果、公开接口或假设。

自然语言解释是附加视图，不是机器协议的唯一载体。

### 10.5 审计优先级协议

大规模 AI 变更不能把所有差异平铺给人类。审计输出必须按风险排序，并允许机器过滤，但高风险变化不能被折叠或过滤掉。

| 等级 | 必须包含的变化 | 默认展示 |
|---|---|---|
| R0 阻断 | Capability 扩大、`unsafe` 新增、`assume` 新增、公开契约弱化、公开效果扩大、保障策略降低 | 置顶、展开、独立审批，不能批量忽略 |
| R1 高 | 外部适配器等级提高、资源上界放宽、公开布局/ABI 改变、证明从已通过变为未执行 | 展开并要求责任人确认 |
| R2 中 | 私有语义变化、证明义务集合变化、性能成本变化，但公开保证未改变 | 汇总，可按模块展开 |
| R3 低 | 纯格式化、注释、私有实现变化且接口与证明摘要不变 | 默认折叠，可查询 |

**AUDIT-001** R0 变化必须在任何人类视图和机器摘要中置顶，工具不得允许插件降低其风险级别。  
**AUDIT-002** 工具必须同时提供按风险、核心层、模块、责任方、Capability 和假设来源过滤的机器可读视图。  
**AUDIT-003** 折叠只影响展示，不得从制品、语义差异或审批记录中删除变化。  
**AUDIT-004** 纯格式化和语义哈希未变的修改必须与语义变化分离，避免稀释高风险信号。  
**AUDIT-005** 风险分类规则、规则版本和输入哈希必须进入审计制品；分类失败默认提升而非降低风险。  
**AUDIT-006** 批量审批 R0 变化必须逐项保留批准者、理由和意图清单关联，不能只保留一次总确认。

### 10.6 生成-证明闭环

官方工具必须支持以下原子工作流：

1. 提交目标接口与契约；
2. 检查声明是否自洽、是否可满足；
3. 提交实现或语义补丁；
4. 返回未完成义务、反例和资源冲突；
5. 增量提交实现或证明修复；
6. 在策略闭包满足后冻结语义哈希；
7. 生成与该哈希绑定的证明和制品；
8. 输出供人类审批的语义差异与假设差异。

该流程必须可由本地进程协议调用，不要求 AI 操作终端文本或模拟编辑器按键。

---

## 11. 工具链与构建系统

### 11.1 单一官方入口

首个稳定版本必须提供一个版本统一的官方工具入口，覆盖：

- 格式化与规范化；
- 解析、类型、资源和效果检查；
- 契约验证与证明重放；
- 测试、模糊测试和模型检查；
- 构建、链接和目标检查；
- 包解析、锁定、签名和审计；
- 文档、接口和语义差异生成；
- 版本迁移与结构化补丁；
- 制品检查和假设账本查询。

工具可以由多个内部进程实现，但版本、协议和用户入口必须一致，避免独立工具产生互相矛盾的语义。

### 11.2 可复现构建

**语义可复现**指相同声明输入产生相同规范化核心 IR 哈希、公开接口、证明义务、证明结果和假设闭包，是所有构建的强制要求。**字节可复现**指在固定目标与工具链下产生完全相同的二进制和封装元数据，是目标配置声明的工程能力。

**TOOL-BUILD-001** 构建默认无网络权限。  
**TOOL-BUILD-002** 读取主机文件、环境变量、时间、熵和系统工具必须作为显式、哈希化输入。  
**TOOL-BUILD-003** 依赖解析必须由锁文件和内容哈希唯一确定。  
**TOOL-BUILD-004** 规范版本、编译器、证明内核、后端、目标描述和链接器必须固定版本或哈希。  
**TOOL-BUILD-005** 路径、时间戳、并行调度和哈希表顺序不得造成语义结果差异。  
**TOOL-BUILD-006** 相同声明输入必须生成相同核心 IR 哈希、公开接口、证明义务、证明结果和假设闭包。  
**TOOL-BUILD-007** 构建图中的生成步骤必须服从与 `comptime` 相同的能力和输入规则。  
**TOOL-BUILD-008** 构建失败不得留下可被误认为完整发布物的制品。  
**TOOL-BUILD-009** 声明为字节可复现的目标应该在受支持环境中生成字节一致二进制和元数据；未达到时不得伪造该状态。  
**TOOL-BUILD-010** 所有已知字节不确定来源必须进入清单，包括后端、链接器、签名封装和平台元数据，并标明是否影响语义哈希。  
**TOOL-BUILD-011** 发布策略可以强制字节可复现；此时任一未允许不确定来源或字节差异必须阻断发布。

### 11.3 增量性与缓存

**TOOL-INC-001** 缓存以语义哈希而非文件修改时间为依据。  
**TOOL-INC-002** 接口、实现、契约、证明和目标代码使用独立但关联的缓存键。  
**TOOL-INC-003** 修改私有实现时，若公开语义与证明摘要不变，不得强制无关依赖重证。  
**TOOL-INC-004** 缓存命中不能绕过证书检查和策略闭包检查。  
**TOOL-INC-005** 远程缓存是不可信存储；所有对象必须在本地按哈希和签名验证。

### 11.4 参考实现与多实现一致性

- 形式规范是语义权威，参考解释器用于执行对照但不是规范替代品；
- 编译器、解释器、证明义务生成器和后端必须共享版本化测试向量；
- 至少一个独立实现负责差分验证核心语义；
- 官方发布必须通过随机程序生成、等价变换和后端差分测试；
- 自举只能证明可用性，不能单独证明编译器正确性。

---

## 12. 包与制品格式

### 12.1 包的最小组成

一个可解析包必须包含：

- 包身份、版本和语言规范版本；
- 模块图与公开接口；
- 内容寻址依赖锁；
- 构建目标和构建配方；
- 请求的构建期与运行时 Capability；
- 保障策略；
- 许可证和来源元数据。

包名是人类可读定位符，内容哈希才是构建身份。相同名称和版本但内容不同的对象必须被视为冲突。

### 12.2 发布制品的最小组成

发布制品必须绑定并可查询：

| 类别 | 必需内容 |
|---|---|
| 语义 | 核心 IR 哈希、公开接口、契约、效果、能力需求 |
| 证明 | 义务列表、已证明状态、证书、检查器版本 |
| 信任 | `unsafe` 清单、假设账本、未验证外部边界、后端状态 |
| 构建 | 完整输入哈希、工具链哈希、目标描述、语义复现状态、字节复现状态与不确定来源 |
| 依赖 | 传递依赖哈希、接口摘要、保障与假设闭包 |
| 运行 | 入口点、资源需求、显式终止模式、目标 ABI |
| 供应链 | 来源、签名、签名者策略、许可证材料清单 |

签名证明“谁批准了这个哈希”，不证明程序正确；证明证书证明“命题相对于假设成立”，不证明签名者身份。工具不得混淆二者。

### 12.3 长期可读性

**ART-001** 公开接口、证明证书和清单必须使用有规范说明的开放格式。  
**ART-002** 每个格式版本必须提供规范化规则和迁移器。  
**ART-003** 制品必须携带足以定位其规范和检查器实现的内容哈希。  
**ART-004** 仓库应能保存最小重放包，使未来环境无需访问原始在线仓库。  
**ART-005** 迁移不得覆盖旧证书；新旧语义哈希和证明状态必须并存可查。

---

## 13. 互操作与扩展边界

互操作是产品能力，但不是核心语义的来源。

### 13.1 外部语言与包生态

任何外部生态适配器必须执行以下步骤：

1. 将外部依赖固定为内容哈希；
2. 提取或手工声明 ABI、所有权、效果、线程和失败契约；
3. 生成最小 `unsafe` 边界；
4. 在安全包装层验证可验证的前置条件；
5. 把剩余性质登记为传递假设；
6. 隔离构建脚本的文件、网络、进程和环境能力；
7. 在制品中记录适配器、外部运行时和依赖管理器版本。

官方适配器只定义两个受限等级：

| 等级 | 允许能力 | 信任状态 | `critical` 默认 |
|---|---|---|---|
| A0 静态声明绑定 | 固定 ABI/布局、声明式符号映射、无构建脚本、无运行时反射 | 边界前置条件可证明部分进入证书，剩余外部实现仍是显式假设 | 可进入，但外部假设仍须在白名单 |
| A1 受限动态适配 | 在沙箱内运行已固定脚本或生成器，只能使用清单授予的有限 Capability，所有输入输出内容寻址 | 脚本、动态运行时和无法证明行为全部进入假设账本 | 标准 `critical` 拒绝 |

超出 A1 的任意构建脚本、运行时注入或隐式依赖不属于受支持适配器，只能放在进程隔离的外部系统中，不能链接进安全闭包。

**INTEROP-001** 每个适配器必须声明 A0 或 A1，工具根据实际行为验证等级，不能只信任作者标签。  
**INTEROP-002** A1 脚本必须有时间、内存、文件、网络和子进程上限；未声明访问静态拒绝，全部产物进入内容哈希。  
**INTEROP-003** 动态语言运行时和允许包脚本的生态最高只能标记为 A1，不得标记为 A0。  
**INTEROP-004** 标准 `critical` 策略不得包含 A1 的传递闭包；接受 A1 的派生策略不得继续使用标准 `critical` 状态标识。  
**INTEROP-005** 适配器等级提高、脚本权限扩大或外部运行时变化属于 R1；若同时扩大 Capability、效果或假设，则升级为 R0。  
**INTEROP-006** 官方维护至少一个 A0 ABI 适配器和一个 A1 沙箱参考实现，避免安全规则只有文档而无可用路径。

因此，Python、npm 或其他包管理器可以通过外部适配器接入，但不得获得以下特权：

- 绕过 Aether 的锁定和能力模型；
- 把动态外部行为标记为静态已证明；
- 在构建时任意执行未声明脚本；
- 向安全模块泄漏未经声明的共享状态。

### 13.2 新计算介质

新介质首先应由库和目标描述表达：

- 以线性名义类型表示不可复制资源；
- 以状态转换函数表示合法操作；
- 以 Capability 表示访问权限；
- 以效果表示与介质交互；
- 以契约或协议表示可接受状态演化；
- 以后端或外部适配器实现实际执行。

只有当现有内核无法保持某条核心不变量，且问题不能由上述机制表达时，才允许提出内核扩展。

### 13.3 领域构造

排版构建器、张量、专用交易构造、特定门操作和其他领域对象均属于库、生成器或可选工具。它们可以拥有优秀的一等工具体验，但不能因此成为语言关键字或核心类型。

---

## 14. 参考表层语法

本节用于证明核心需求具有一致的可表达面，不以模仿现有语言为目标。最终语法规范必须由无歧义文法、静态语义和降低规则共同定义。

### 14.1 语法原则

- UTF-8 源文件；代码标识符限定为 ASCII，非 ASCII 内容只出现在注释和字符串中；
- 花括号划分块，分号结束简单语句，缩进不承载语义；
- 导入、类型转换、移动、借用、分配、外部效果和动态分派显式；
- 不允许通配导入进入公开命名空间；
- 不按参数类型重载函数；
- 公开签名必须显式写出参数类型、返回类型、效果和跨边界生命周期；
- 解析必须唯一，不依赖符号表才能决定基本语法树形状；
- 规范格式化器产生唯一文本投影。

### 14.2 基础示例

```aether
module sample.buffer;

use core.result.{Result, Ok, Err};

pub enum PushError {
    Full,
}

pub struct Buffer<T, const N: usize> {
    data: [Maybe<T>; N],
    len: usize,
}

pub fn push<T, const N: usize>(
    buffer: &mut Buffer<T, {N}>,
    value: T,
) -> Result<(), PushError>
effects {}
requires push.bounds: buffer.len <= N;
ensures push.ok_len:
    result is Ok(()) => buffer.len == old(buffer.len) + 1;
ensures push.err_unchanged:
    result is Err(PushError.Full) => buffer.len == old(buffer.len);
{
    if buffer.len == N {
        return Err(PushError.Full);
    }

    buffer.data[buffer.len].write(move value);
    buffer.len = exact_add(buffer.len, 1);
    return Ok(());
}
```

示例中的 `exact_add` 要么由当前路径证明不溢出，要么形成未完成证明义务。需要其他行为时必须写 `checked_add`、`wrapping_add` 或 `saturating_add`。

### 14.3 线性资源与显式释放

```aether
module sample.resource;

pub linear struct Port {
    raw: RawPort,
}

pub fn write(port: &mut Port, bytes: &[u8]) -> Result<usize, IoError>
effects { io(port) }
requires write.open: port.state() == PortState.Open;
ensures write.bound: result is Ok(n) => n <= bytes.len;
{
    return unsafe { ffi_write(port.raw, bytes) };
}

pub consume fn close(port: Port) -> Result<(), CloseError>
effects { io(port) }
ensures close.consumed: consumed(port);
{
    let raw = unsafe { take_raw(move port) };
    return unsafe { ffi_close(move raw) };
}
```

调用方不能让 `Port` 静默离开作用域。它必须调用 `close`，或把所有权移交给另一个明确承担关闭责任的对象。

### 14.4 Capability 与显式效果

```aether
module sample.nonce;

pub fn make_nonce(
    entropy: &mut EntropyCapability,
    out: &mut [u8; 32],
) -> Result<(), EntropyError>
effects { entropy(entropy) }
ensures nonce.initialized: result is Ok(()) => initialized(out);
{
    return entropy.fill(out);
}
```

没有 `EntropyCapability` 时，程序不能通过全局 API、进程环境或隐藏运行时获得随机性。

### 14.5 结构化并发

```aether
module sample.parallel;

pub fn compute_pair(
    tasks: &mut TaskCapability,
    input: &Input,
) -> Result<Pair, ComputeError>
effects { concurrent(tasks) }
{
    scope work {
        let left_handle = spawn[work](
            tasks,
            [borrow input] || -> Result<Left, ComputeError> effects {} {
                return left(input);
            },
        );
        let right_handle = spawn[work](
            tasks,
            [borrow input] || -> Result<Right, ComputeError> effects {} {
                return right(input);
            },
        );

        let left_result = join(move left_handle);
        let right_result = join(move right_handle);

        match (left_result, right_result) {
            (Ok(a), Ok(b)) => return Ok(Pair { left: a, right: b });
            (Err(e), _) => return Err(e);
            (_, Err(e)) => return Err(e);
        }
    }
}
```

`scope` 的退出证明必须确认所有句柄已消费。失败分支的取消和等待规则必须在最终并发规范中展开，不能依赖隐式析构。

### 14.6 编译期执行

```aether
module sample.table;

pub comptime fn make_table<const N: usize>() -> [u32; N]
effects {}
decreases N;
{
    var out: [u32; N] = zeroed();
    var i: usize = 0;

    while i < N
    invariant table.range: i <= N;
    decreases N - i;
    {
        out[i] = checked_formula(i);
        i = exact_add(i, 1);
    }

    return out;
}

pub const TABLE: [u32; 256] = comptime make_table::<{256}>();
```

该函数没有读取文件、网络、当前时间或随机数的入口。若生成需要外部数据，数据必须作为内容寻址的显式构建输入传入。

---

## 15. 表层候选文法

以下 EBNF 是全部候选核心层的语法并集，不替代各阶段冻结的规范化语法文件。M0 只能冻结其中的 K0 子集，不能因为产生式已写在本节就把 K1/K2 视为已批准。最终冻结时可以修改拼写，但不得引入歧义或违反核心不变量。`?` 表示可选，`*` 表示零次或多次，`+` 表示一次或多次。

| 子集 | M0/M1 状态 | 候选产生式范围 |
|---|---|---|
| K0 | 唯一允许冻结和实现的稳定子集 | 模块、显式导入、常量、非泛型结构/枚举/函数、顺序语句与表达式、所有权/借用/仿射值、数组/切片、显式错误和基础契约条款 |
| K1 | M1 只能实验，M2 才可冻结 | 泛型、trait、`linear`、效果条款、Capability 相关类型、闭包、`comptime`、外部边界和证明项 |
| K2a | M0/M1 禁止，M3 才可冻结 | `task`、`scope`、`spawn`、`join`、原子和显式取消 |
| K2b | v1 非强制 | `protocol`、完整效果多态和高级并发规范 |

K0 源文件若出现后层产生式必须返回稳定的“核心层未启用”错误，而不是尝试部分解释。K0 函数不写 `effects` 条款且只能调用 K0 可表达的纯或内建显式资源操作；启用 K1 后，公开函数的 `effects` 条款变为强制。候选并集因此把 `effect_clause` 写成语法可选，具体必需性由核心层静态语义决定。

```ebnf
source_file       = module_decl, import_decl*, item*, EOF ;
module_decl       = "module", path, ";" ;
import_decl       = "use", path,
                    (".", "{", import_name, (",", import_name)*,
                     ","?, "}")?, ";" ;
import_name       = IDENT, ("as", IDENT)? ;

item              = attribute*, visibility?, item_body ;
item_body         = const_item | type_item | struct_item | enum_item |
                    trait_item | impl_item | function_item |
                    foreign_block | proof_item ;
visibility        = "pub" | "package" ;
attribute         = "@", path, ("(", argument_list?, ")")? ;

const_item        = "const", IDENT, ":", type, "=", expression, ";" ;
type_item         = "type", IDENT, generic_params?, "=", type, ";" ;
struct_item       = resource_modifier?, "struct", IDENT, generic_params?,
                    where_clause?, "{", field_decl*, "}" ;
resource_modifier = "linear" | "affine" ;
field_decl        = visibility?, IDENT, ":", type, "," ;
enum_item         = "enum", IDENT, generic_params?, where_clause?,
                    "{", variant_decl*, "}" ;
variant_decl      = IDENT,
                    ("(", type_list?, ")" |
                     "{", field_decl*, "}")?, "," ;

trait_item        = "trait", IDENT, generic_params?, where_clause?,
                    "{", trait_member*, "}" ;
trait_member      = function_signature, ";" | associated_type |
                    associated_const ;
associated_type   = "type", IDENT, (":", bound_list)?, ";" ;
associated_const  = "const", IDENT, ":", type, ";" ;
impl_item         = "impl", generic_params?, type,
                    ("for", type)?, where_clause?,
                    "{", impl_member*, "}" ;
impl_member       = function_item | const_item |
                    "type", IDENT, "=", type, ";" ;

function_item     = function_kind, IDENT, generic_params?,
                    "(", parameter_list?, ")", "->", type,
                    effect_clause?, where_clause?, contract_clause*, block ;
function_signature = function_kind, IDENT, generic_params?,
                    "(", parameter_list?, ")", "->", type,
                    effect_clause?, where_clause?, contract_clause* ;
function_kind     = "fn" | "comptime", "fn" | "consume", "fn" |
                    "task", "fn" | "unsafe", "fn" ;
parameter_list    = parameter, (",", parameter)*, ","? ;
parameter         = IDENT, ":", type ;

foreign_block     = "foreign", STRING_LITERAL, "{", foreign_decl*, "}" ;
foreign_decl      = attribute*, "fn", IDENT,
                    "(", parameter_list?, ")", "->", type,
                    effect_clause, contract_clause*, ";" ;
proof_item        = "proof", IDENT, "shows", clause_id,
                    "{", proof_statement*, "}" ;
proof_statement   = "have", clause_id, ":", spec_expression,
                    ("by", proof_method)?, ";" |
                    "use", clause_id, ";" |
                    "qed", ";" ;
proof_method      = path, ("(", spec_argument_list?, ")")? ;

effect_clause     = "effects", "{", effect_list?, "}" ;
effect_list       = effect, (",", effect)*, ","? ;
effect            = path, ("(", place_list?, ")")? ;
contract_clause   = requires_clause | ensures_clause | modifies_clause |
                    invariant_clause | decreases_clause | protocol_clause ;
requires_clause   = "requires", clause_id, ":", spec_expression, ";" ;
ensures_clause    = "ensures", clause_id, ":", spec_expression, ";" ;
modifies_clause   = "modifies", clause_id, ":", place_list, ";" ;
invariant_clause  = "invariant", clause_id, ":", spec_expression, ";" ;
decreases_clause  = "decreases", spec_expression, ";" ;
protocol_clause   = "protocol", clause_id, ":", path, ";" ;
clause_id         = path ;

generic_params    = "<", generic_param, (",", generic_param)*, ","?, ">" ;
generic_param     = IDENT, (":", bound_list)? |
                    "const", IDENT, ":", type |
                    LIFETIME ;
where_clause      = "where", predicate, (",", predicate)*, ","? ;
predicate         = type, ":", bound_list | LIFETIME, ":", LIFETIME ;
bound_list        = bound, ("+", bound)* ;
bound             = path | LIFETIME ;

type              = path_type | tuple_type | array_type | slice_type |
                    reference_type | pointer_type | function_type |
                    dynamic_type | never_type ;
path_type         = path, generic_args? ;
tuple_type        = "(", type_list?, ")" ;
array_type        = "[", type, ";", const_expression, "]" ;
slice_type        = "[", type, "]" ;
reference_type    = "&", LIFETIME?, "mut"?, type ;
pointer_type      = "unsafe", "*", ("const" | "mut"), type ;
function_type     = "fn", "(", type_list?, ")", "->", type,
                    effect_clause? ;
dynamic_type      = "dyn", bound_list ;
never_type        = "never" ;

block             = "{", statement*, expression?, "}" ;
statement         = let_statement | var_statement | assignment_statement |
                    expression_statement | return_statement | break_statement |
                    continue_statement | drop_statement | assert_statement |
                    assume_statement | while_statement | for_statement |
                    scope_statement ;
let_statement     = "let", pattern, type_annotation?, "=", expression, ";" ;
var_statement     = "var", pattern, type_annotation?, "=", expression, ";" ;
assignment_statement = place, "=", expression, ";" ;
expression_statement = expression, ";" ;
return_statement  = "return", expression?, ";" ;
break_statement   = "break", LOOP_LABEL?, expression?, ";" ;
continue_statement = "continue", LOOP_LABEL?, ";" ;
drop_statement    = "drop", expression, ";" ;
assert_statement  = "assert", clause_id, ":", spec_expression, ";" ;
assume_statement  = "assume", clause_id, ":", spec_expression, ";" ;
while_statement   = LOOP_LABEL?, "while", expression,
                    loop_contract*, block ;
for_statement     = LOOP_LABEL?, "for", pattern, "in", expression,
                    loop_contract*, block ;
loop_contract     = invariant_clause | decreases_clause | modifies_clause ;
scope_statement   = "scope", IDENT, block ;

expression        = logical_or_expression ;
logical_or_expression = logical_and_expression,
                    ("or", logical_and_expression)* ;
logical_and_expression = bit_or_expression,
                    ("and", bit_or_expression)* ;
bit_or_expression = bit_xor_expression, ("|", bit_xor_expression)* ;
bit_xor_expression = bit_and_expression, ("^", bit_and_expression)* ;
bit_and_expression = equality_expression, ("&", equality_expression)* ;
equality_expression = comparison_expression,
                    (("==" | "!="), comparison_expression |
                     "is", pattern)? ;
comparison_expression = shift_expression,
                    (("<" | "<=" | ">" | ">="), shift_expression)? ;
shift_expression  = additive_expression,
                    (("<<" | ">>"), additive_expression)* ;
additive_expression = multiplicative_expression,
                    (("+" | "-"), multiplicative_expression)* ;
multiplicative_expression = unary_expression,
                    (("*" | "/" | "%"), unary_expression)* ;
unary_expression  = ("not" | "~" | "-" | "move"), unary_expression |
                    "&", "mut"?, place |
                    cast_expression | postfix_expression ;
cast_expression   = "cast", "<", type, ">", "(", expression, ")" ;

postfix_expression = primary_expression, postfix_suffix* ;
postfix_suffix    = call_suffix | field_suffix | index_suffix ;
call_suffix       = call_generic_args?, "(", argument_list?, ")" ;
call_generic_args = "::", generic_args ;
field_suffix      = ".", IDENT ;
index_suffix      = "[", expression, "]" ;

primary_expression = literal | path | tuple_expression | array_expression |
                    struct_expression | block | if_expression |
                    match_expression | loop_expression | closure_expression |
                    spawn_expression | join_expression |
                    comptime_expression | unsafe_expression |
                    old_expression | quantifier_expression ;
tuple_expression  = "(", expression, ",",
                    (expression, (",", expression)*)?, ","?, ")" |
                    "(", expression, ")" | "(", ")" ;
array_expression  = "[", argument_list?, "]" |
                    "[", expression, ";", const_expression, "]" ;
struct_expression = path, "{", field_value*, "}" ;
field_value       = IDENT, ":", expression, "," ;
if_expression     = "if", expression, block,
                    ("else", (block | if_expression))? ;
match_expression  = "match", expression, "{", match_arm+, "}" ;
match_arm         = pattern, guard?, "=>", expression, "," ;
guard             = "if", expression ;
loop_expression   = LOOP_LABEL?, "loop", loop_contract*, block ;
closure_expression = capture_clause, "||", parameter_list?,
                    "->", type, effect_clause, block ;
capture_clause    = "[", capture_list?, "]" ;
capture_list      = capture_item, (",", capture_item)*, ","? ;
capture_item      = "move", IDENT | "borrow", "mut"?, IDENT ;
spawn_expression  = "spawn", "[", IDENT, "]",
                    "(", argument_list?, ")" ;
join_expression   = "join", "(", expression, ")" ;
comptime_expression = "comptime", expression ;
unsafe_expression = "unsafe", block ;

place             = IDENT, place_suffix* ;
place_suffix      = ".", IDENT | "[", expression, "]" ;
pattern           = or_pattern ;
or_pattern        = atomic_pattern, ("|", atomic_pattern)* ;
atomic_pattern    = "_" | IDENT | literal | tuple_pattern |
                    struct_pattern | enum_pattern | reference_pattern ;
tuple_pattern     = "(", pattern_list?, ")" ;
struct_pattern    = path, "{", pattern_field*, "}" ;
pattern_field     = IDENT, (":", pattern)?, "," ;
enum_pattern      = path, "(", pattern_list?, ")" ;
reference_pattern = "&", "mut"?, pattern ;

spec_expression   = expression, ("=>", spec_expression)? ;
quantifier_expression = ("forall" | "exists"), IDENT, ":", type,
                    ".", spec_expression ;
old_expression    = "old", "(", expression, ")" ;
const_expression  = spec_expression ;

literal           = INTEGER_LITERAL | FLOAT_LITERAL | CHAR_LITERAL |
                    STRING_LITERAL | BYTE_STRING_LITERAL |
                    "true" | "false" ;
type_annotation   = ":", type ;
path              = IDENT, (".", IDENT)* ;
generic_args      = "<", generic_arg, (",", generic_arg)*, ","?, ">" ;
generic_arg       = type | "{", const_expression, "}" | LIFETIME ;
argument_list     = expression, (",", expression)*, ","? ;
spec_argument_list = spec_expression, (",", spec_expression)*, ","? ;
pattern_list      = pattern, (",", pattern)*, ","? ;
type_list         = type, (",", type)*, ","? ;
place_list        = place, (",", place)*, ","? ;
```

### 15.1 词法约束

```ebnf
IDENT               = ("A"..."Z" | "a"..."z" | "_"),
                      ("A"..."Z" | "a"..."z" | "0"..."9" | "_")* ;
LIFETIME             = "'", IDENT ;
LOOP_LABEL           = "@", IDENT ;
INTEGER_LITERAL      = decimal_integer | hexadecimal_integer |
                       octal_integer | binary_integer ;
FLOAT_LITERAL        = decimal_digits, ".", decimal_digits,
                       exponent?, float_suffix? ;
CHAR_LITERAL         = "'", (UNICODE_SCALAR | ESCAPE_SEQUENCE), "'" ;
STRING_LITERAL       = '"', (UNICODE_SCALAR | ESCAPE_SEQUENCE)*, '"' ;
BYTE_STRING_LITERAL  = "b", '"', (BYTE_VALUE | BYTE_ESCAPE)*, '"' ;
decimal_integer      = decimal_digits, integer_suffix? ;
hexadecimal_integer  = "0x", hex_digits, integer_suffix? ;
octal_integer        = "0o", octal_digits, integer_suffix? ;
binary_integer       = "0b", binary_digits, integer_suffix? ;
decimal_digits       = decimal_digit, (decimal_digit | "_", decimal_digit)* ;
hex_digits           = hex_digit, (hex_digit | "_", hex_digit)* ;
octal_digits         = octal_digit, (octal_digit | "_", octal_digit)* ;
binary_digits        = binary_digit, (binary_digit | "_", binary_digit)* ;
decimal_digit        = "0"..."9" ;
hex_digit            = decimal_digit | "A"..."F" | "a"..."f" ;
octal_digit          = "0"..."7" ;
binary_digit         = "0" | "1" ;
exponent             = ("e" | "E"), ("+" | "-")?, decimal_digits ;
integer_suffix       = "i8" | "i16" | "i32" | "i64" | "i128" |
                       "u8" | "u16" | "u32" | "u64" | "u128" |
                       "isize" | "usize" ;
float_suffix         = "f32" | "f64" ;
```

补充词法规则：

- 关键字不能作为 `IDENT`，完整关键字集合由上述文法中的固定单词给出；
- 数字分隔符 `_` 只能出现在两个有效数字之间，规范化输出删除分隔符；
- 源文件、字符串和注释是 UTF-8；标识符只允许 ASCII，消除 Unicode 同形和规范化分歧；
- 行注释从 `//` 到换行，块注释使用 `/* ... */` 并允许嵌套；注释不进入语义哈希；
- 字符字面量必须解码为一个 Unicode 标量值，代理项和无效 UTF-8 静态拒绝；
- 转义集合只包含 `\\0`、`\\n`、`\\r`、`\\t`、`\\\\`、`\\'`、`\\\"`、`\\xNN` 和 `\\u{HEX}`；
- 相邻 token 必须由最长匹配规则唯一切分；规范格式化器在可能粘连处插入空格；
- `@name` 只用于控制流标签，属性的 `@` 后必须是路径且位于 item 前，二者由语法位置区分；
- 生命周期只在类型和泛型位置出现，字符字面量必须闭合，因此二者无需名称解析即可区分。

### 15.2 运算与解析约束

从高到低的结合层级为：后缀、前缀、一元、乘除余、加减、移位、大小比较、相等比较、按位与、按位异或、按位或、逻辑与、逻辑或、规范蕴含。除赋值和规范蕴含右结合外，其余二元层级左结合；大小与相等比较不得链式书写。

`+`、`-`、`*` 是精确操作，固定宽度结果必须证明可表示。回绕、饱和和返回错误的算术分别通过 `wrapping_*`、`saturating_*` 和 `checked_*` 内建函数表达。`and` 与 `or` 从左到右短路，按位运算不短路。泛型实参在值调用位置必须使用 `::<...>`，避免与大小比较产生句法歧义。常量泛型实参统一写为 `{expression}`，类型实参不加括号，因此解析器无需符号表即可区分二者。

`assert id: proposition;` 产生必须被证明的静态义务，证明后擦除，不插入隐式运行时分支。需要运行时验证时，程序必须用普通 `if`、匹配和显式错误值表达。`assume` 只建立假设账本条目，不生成证明；发布策略决定是否拒绝。

`old`、`forall`、`exists` 和 `is` 在语法上可唯一解析，但静态语义只允许它们出现在契约、证明、`assert` 或 `assume` 的规范上下文。`drop` 只适用于显式实现无副作用 `Discard` 能力的仿射值；线性值必须通过其协议定义的消费函数结束。`forget` 不是安全语句，只能作为带假设账本记录的 `unsafe` 内建操作调用。

最终 M0 规范还必须给出每个产生式的静态语义、所有非法组合、错误恢复边界，以及到核心 IR 的唯一降低。文法覆盖完整不等于语义已经冻结。

---

## 16. 用户故事

本节只验证价值和排优先级。任何用户故事都不得直接创造核心机制。

### US-01 AI 生成受约束组件

**作为** AI 作者，  
**我希望** 接收一个包含接口、契约、效果上限和资源策略的任务，并通过结构化反例迭代，  
**从而** 在无需人工逐行修复的情况下交付可证明组件。

验收条件：

- 缺少前置条件、效果越界和线性资源遗漏分别返回稳定诊断；
- AI 可只依据结构化字段定位失败义务；
- 自动修复不能添加未批准的权限或假设；
- 完成后生成证明证书和语义差异。

### US-02 人类审计大规模生成变更

**作为** 人类审计者，  
**我希望** 先看接口、权限、效果、资源上界、证明覆盖和假设变化，  
**从而** 不把文本行数当作风险代理。

验收条件：

- 审计视图区分纯重格式化、私有实现变化和公开语义变化；
- 任一新增 Capability、`unsafe` 或 `assume` 单独置顶；
- 可以从二进制追溯到变更后的契约和审批记录。

### US-03 保障策略阻止错误发布

**作为** 发布责任人，  
**我希望** 指定一组组件必须无假设、无动态分配且契约全部证明，  
**从而** 任一条件不满足时无法生成可签名发布物。

验收条件：

- 策略对传递依赖生效；
- 警告配置不能绕过发布门槛；
- 失败报告指向具体依赖、义务或效果；
- 降低策略会形成独立待审批的语义事件。

### US-04 安全封装外部实现

**作为** 平台维护者，  
**我希望** 通过一个最小边界使用外部库，并声明其 ABI、资源转移和假设，  
**从而** 外部代码不会被误认为满足 Aether 的全部保证。

验收条件：

- 缺失布局或所有权声明时绑定生成失败；
- 公开安全包装器必须证明内部调用前置条件；
- 传递假设出现在所有依赖它的发布物中；
- 替换外部版本会使相关证明和审计失效。

### US-05 引入一种新的不可复制资源

**作为** 库作者，  
**我希望** 用线性类型、Capability、状态转换和协议定义新资源，  
**从而** 无需修改编译器关键字即可阻止复制、重复消费和非法顺序。

验收条件：

- 复制资源、遗漏最终消费或跳过状态均静态失败；
- 资源实现可以替换而接口契约保持稳定；
- 审计工具能显示资源从创建到消费的路径。

### US-06 重放历史制品

**作为** 长期维护者，  
**我希望** 在没有原 AI、在线求解器和原包仓库的环境中重放证明与构建，  
**从而** 判断历史二进制仍对应当时被批准的语义和假设。

验收条件：

- 最小重放包可离线检查；
- 证明检查不调用网络和外部求解器；
- 缺少任何构建输入时明确失败；
- 迁移到新规范时保留旧结果，不覆盖历史证据。

---

## 17. 功能验收矩阵

| 需求域 | 正向验收 | 必须拒绝的反例 | 发布证据 |
|---|---|---|---|
| 所有权 | 唯一所有者移动后可继续消费 | 使用后移动、双重释放、借用逃逸 | 资源检查摘要 |
| 线性资源 | 每条路径恰好消费一次 | 提前返回遗漏消费、复制句柄 | 消费路径证明 |
| 分配 | 显式分配器和失败分支 | 容器或闭包隐式堆分配 | 分配效果与上界 |
| Capability | 权限由参数传入并可缩小 | 读取全局时间、环境或网络 | 能力需求清单 |
| 效果 | 实现效果是声明子集 | 私有调用静默扩大公开效果 | 效果闭包 |
| 契约 | B1 调用点建立前置条件，返回点建立后置条件 | 策略要求的义务缺失仍发布 | 分级证书与义务哈希 |
| 并发 | K2a 所有任务句柄在作用域内消费 | 孤儿任务、共享可变数据竞争 | 任务、取消与同步摘要 |
| `unsafe` | 最小边界且前置条件已建立 | 从安全 API 到未登记原始操作 | 可达边界清单 |
| 构建 | 隔离环境语义哈希一致；声明目标可验证字节一致 | 未声明输入导致语义漂移；字节差异未登记 | 语义复现与字节复现清单 |
| AI 协议 | 结构化补丁在正确哈希上原子应用 | 过期补丁覆盖新状态 | 补丁与语义差异 |
| 审计 | R0 变化置顶且逐项批准 | 权限或假设扩大被折叠/降级 | 风险分类与审批记录 |
| 互操作 | A0/A1 行为符合声明等级 | 动态脚本伪装为 A0 | 适配器等级与假设清单 |
| 后端 | 目标代码通过验证链 | 只凭编译成功宣称端到端证明 | 后端状态与证据 |

---

## 18. 质量属性与量化门槛

### 18.1 正确性

- 核心静态规则必须有形式化定义和机器化元理论模型；
- 每个规范示例必须在参考实现和独立实现中结果一致；
- 对所有已修复的健全性缺陷保留永久回归样例；
- 证明检查器必须进行覆盖引导模糊测试和证书变异测试；
- 发布候选不得有已知可从安全代码触发的未定义行为或类型系统不健全漏洞。

### 18.2 确定性与可复现性

- 官方测试语料在所有支持主机上规范化 ASR 哈希 100% 一致；
- 固定声明输入在至少两个隔离环境中核心 IR、公开接口、证明义务和证明结果 100% 一致；
- 声明为字节可复现的目标应该在其支持矩阵内达到二进制和元数据 100% 字节一致，未达到的目标必须记录差异来源且不能携带该声明；
- 证明重放不得依赖线程调度顺序；
- 所有非确定输入遗漏测试必须稳定失败，而不是生成不同结果。

### 18.3 性能可解释性

- 每个非内联调用、动态分派、边界检查、分配、原子操作和任务切换都可在成本报告中定位；
- 已证明可消除的检查可以零运行时成本移除，并保留证明依据；
- 基准比较必须固定算法、数据布局、目标和安全前提；
- 相比等价原生实现超过 5% 的稳定回归必须能归因并经发布审批，不能用“抽象开销”笼统解释；
- 编译器必须报告无法静态界定的栈、堆或任务资源，而不是猜测上界。

### 18.4 AI 可操作性

在官方生成修复基准上：

- 100% 错误诊断提供稳定代码和语义节点；
- 100% 自动补丁带前置语义哈希；
- 100% 权限、效果、`unsafe` 和假设扩大被标记为升级审批；
- 至少 90% 的单点类型、所有权和契约反例可在不读取自然语言诊断的情况下定位到相关节点；
- 批量补丁失败时不得形成半应用语义状态。

### 18.5 长期演化

- 每个稳定规范版本永久保留解析、检查和迁移测试；
- 破坏性语义变更必须通过显式 edition 或主版本；
- 迁移器输出迁移前后语义哈希、契约变化和证明失效集合；
- 已发布格式至少具备一个独立只读检查器实现。

---

## 19. 测试战略

### 19.1 规范一致性测试

- 每条 `LANG-*` 需求至少包含一个接受样例和一个拒绝样例；
- 表层程序与手写核心 IR 对照，验证降低规则；
- 参考解释器与所有后端执行结果差分比较；
- K1 二计数器机见证与独立参考机逐步差分，并检查编码/模拟关系；
- 浮点、溢出、并发内存顺序和布局使用专门边界语料；
- 规范未定义处视为缺陷，不允许测试通过来替代定义。

### 19.2 健全性测试

- 随机生成良型与近似良型程序攻击类型、借用和效果检查器；
- 对证明证书逐字段、逐节点变异，确认错误证书全部拒绝；
- 对优化 IR 做等价程序随机测试；
- 对 `unsafe` 包装器做前置条件缺失测试；
- 确认通用性见证不含 `unsafe`、`assume` 或隐藏分配，并确认 `critical` 在缺少生产性/资源证据时拒绝它；
- 使用并发 litmus tests 验证内存模型。

### 19.3 可复现性测试

- 改变主机路径、用户名、时区、区域设置、核心数和文件枚举顺序；
- 在断网和空环境变量条件下重建；
- 对依赖仓库返回顺序、缓存命中和并行调度进行扰动；
- 对所有目标检查语义哈希一致性，对声明字节可复现的目标另行检查全部输出字节；
- 对允许的字节差异验证不确定来源清单完整，并确认差异不影响核心 IR、接口或证明状态。

### 19.4 对抗性 AI 测试

- 生成试图通过加 `assume`、扩大效果或请求权限解决错误的补丁；
- 生成过期语义哈希补丁；
- 生成文本合法但 ASR 不满足资源规则的程序；
- 生成大规模无关改写，验证语义差异能过滤噪声；
- 生成诱导诊断器泄漏主机路径、环境秘密或未授权文件的输入。

---

## 20. 实施路线与阶段退出条件

路线按信任链闭合顺序推进，不按应用场景推进。

### G0 正式实现启动门

“开始实现”分为两种状态：

- **语义探针**：为验证单一设计问题而写的可丢弃解释器或检查器，不承诺兼容性，不得成为规范依据；
- **正式 K0 实现**：开始积累需要长期维护的解析器、ASR、检查器和测试，必须先通过 G0。

G0 必须同时满足：

- K0 边界已冻结，K1/K2 构造有明确拒绝行为；
- K0 值、求值顺序、移动、借用、仿射丢弃、分配失败、错误分支和 `unsafe` 合法域已有形式语义草案；
- K0 ASR 子集、规范化规则和语义哈希测试向量已经存在；
- 每个 K0 机制至少有一个正向、一个负向和一个边界测试；
- 第一阶段承载语言/子集、编译器版本和初始信任假设已经登记；
- 未决问题中没有会改变 K0 可观察行为、类型健全性或制品身份的事项；
- 已明确代码原型不能以实现便利为理由修改 E0 或 P1 至 P10。

本文 v0.2 通过后允许启动语义探针，但在上述配套规范和语料实际交付前，正式 K0 实现状态仍为 **No-Go**。

### M0 形式基础冻结

交付：

- E0、P1 至 P10 和 K0 核心不变量的正式化版本；
- K0 小步或等价操作语义；
- K0 类型、所有权、借用、仿射资源、显式分配和错误演算；
- K0 契约节点的解析与保留规则，不要求通用契约证明；
- K0 ASR v0 和语义哈希规范；
- 仅覆盖 K0 的词法、文法、名称解析和降低规范。

退出条件：

- K0 演算具备进展、保持或等价安全定理的机器化证明计划；
- K0 每个表层构造都有唯一降低；
- 不存在依赖具体领域对象的核心规则；
- 两个独立解析器对 K0 规范语料生成相同 ASR；
- 每个冻结机制都能在 M1 参考解释器中对应到可执行测试计划；
- K1/K2 机制没有进入 M0 规范、实现依赖或退出条件。

### M1 安全执行内核

交付：

- K0 前端、类型检查、所有权/借用和仿射资源检查；
- 只执行顺序 K0 程序的参考解释器；
- 显式分配器、显式错误值和最小 `unsafe` 边界；
- 基础契约解析、ASR 保留与接口哈希，不要求 B1/B2 证明；
- 规范化格式器与结构化诊断。

退出条件：

- 使用后移动、悬垂借用、重复释放、隐式分配和未处理错误的负向语料稳定拒绝；
- 顺序 K0 安全子集通过内存与资源安全模糊测试；
- 文本和 ASR 往返语义哈希稳定；
- 无需垃圾回收器运行代表性程序；
- K2 语法全部以稳定“核心层未启用”诊断拒绝；
- M1 退出报告不包含线性类型、Capability、效果、并发或自动证明完成度。

### M2 K1 与契约证明闭环

交付：

- K1 线性类型、基础 Capability、封闭效果集合和效果声明；
- 所有权安全的拥有式间接类型、递归名义数据和显式动态增长路径；
- B0/K1 静态推导与对应负向语料；
- B1 契约语言的受限首版、验证条件生成器和自动求解接口；
- 小型证明证书检查器；
- 反例协议、假设账本、增量证明缓存；
- 策略驱动的“所选 B1 证明失败即不构建”。

退出条件：

- 证书在无求解器环境离线重放；
- 任意证书变异被拒绝；
- 依赖契约可用于模块化验证；
- 未授权 `assume` 无法进入发布制品；
- 通用二计数器机解释器仅使用 K1 安全子集通过检查，其步进轨迹与参考机一致，并具有模拟关系证据；
- 官方冻结基准中，单缺陷 K0/K1 任务在最多 3 次结构化修复循环内无 `assume` 成功率至少 90%；
- 受限 B1 契约任务在最多 5 次结构化修复循环内无新增权限或假设成功率至少 75%；
- 首次自动求解后暴露给 AI 的未完成 B1 义务平均不超过每任务 3 条，95 分位不超过 10 条；
- 若任一自动化阈值未达到，M2 不得退出，必须削减首版 B1 自动证明片段或改进诊断，不能通过放宽 `assume` 策略达标。

官方冻结基准必须版本化、覆盖至少 200 个非重复任务，并按 K0/K1/B1 分类公开统计口径，避免通过更换样本隐藏回归。

### M3 K2a 并发与资源闭包

交付：

- 结构化并发、线性任务句柄、所有权安全通道；
- 顺序一致内存模型和明确的基础原子操作；
- 显式取消、失败聚合和等待语义；
- 任务帧和资源上界报告。

退出条件：

- 安全程序数据竞争自由；
- 孤儿任务、未消费句柄和未消费端点静态失败；
- 并发 litmus tests 与规范一致；
- 作用域所有退出路径完成资源闭包；
- M3 退出不依赖完整会话类型、弱内存优化或通用效果多态。

K2b 只能在 M3 退出后作为独立实验线推进。协议状态可先作为库级线性状态机验证；只有库表达被证明不足时才进入新内核提案。

### M4 可复现产品工具链

交付：

- 单一工具入口、内容寻址包、无网络构建沙箱；
- 制品格式、签名、审计和最小重放包；
- 结构化补丁、风险分级审计、语义差异和机器协议；
- A0/A1 适配器等级和沙箱参考实现；
- 至少一个原生代码后端及翻译验证原型。

退出条件：

- 跨隔离环境核心 IR、接口和证明结果一致；
- 声明为字节可复现的目标通过字节一致测试，其他目标完整报告不确定来源；
- 历史重放包离线验证；
- AI 完成生成-证明-修复闭环；
- 二进制可追溯到语义、证明和假设；
- R0 审计变化无法被折叠、降级或批量静默批准。

### M5 稳定版与独立验证

交付：

- K0、K1 和 K2a 稳定规范 v1；
- 第二解析/检查实现或形式等价的独立验证实现；
- 后端正确性链达到已声明保障；
- 版本迁移、兼容性和治理流程。

退出条件：

- 满足第 4.3 节全部成功标准；
- 所有已知高严重度健全性问题关闭；
- 独立团队可仅凭规范实现兼容检查器；
- 可信启动至少达到阶段 C，外部信任假设完整登记；
- 核心变更治理和历史格式承诺生效；
- K2b 未完成不阻止 v1 发布，也不得被包装成 v1 已有保证。

### M6 可选 K2b 高级组合层

M6 不属于 v1 承诺。只有效果多态或协议状态无法由 K1/K2a 与库组合满足真实、非领域专用的核心不变量时才启动。其退出条件必须单独证明新增复杂度小于被消除的专用规则与证明负担。

---

## 21. 优先级

优先级描述 v1 产品价值，不得覆盖 K0 至 K2a 的阶段顺序。P0 项仍必须在所属核心层到达时才实施。

### P0：不满足则产品不成立

- 正式确定语义；
- 所有权、借用、线性资源与显式分配；
- 效果与 Capability；
- 契约、证明义务、证书和假设账本；
- 结构化并发与无数据竞争；
- ASR、结构化诊断和语义补丁；
- 可复现构建和可追溯制品；
- `unsafe` 最小边界；
- 源到二进制的保证状态不被夸大。

### P1：稳定版所需产品完整性

- trait 与基础跨模块抽象；
- 增量证明和远程不可信缓存；
- 独立检查实现；
- 可信启动达到阶段 C；
- 版本迁移与长期重放包；
- A0/A1 受限适配器；
- 风险分级审计协议；
- 资源与成本报告。

### P2：核心稳定后扩展

- 更丰富的验证逻辑；
- K2b 的效果多态、协议状态和弱内存映射；
- 更多目标后端和外部生态适配器；
- 高级语义生成器；
- 领域库与编辑器体验；
- 证明搜索性能和分布式构建优化。

P2 项目不得以交付压力为由进入 P0 内核。

---

## 22. 风险与应对

| 风险 | 后果 | 应对 | 不接受的捷径 |
|---|---|---|---|
| 证明负担过高 | AI 修复循环慢、库难交付 | 模块契约、增量义务、反例、可复用引理、限定自动化片段 | 静默加入 `assume` |
| 核心机制过多 | 规范无法闭合、实现不一致 | E0、K0/K1/K2 分层、减法评审、小演算优先 | 以场景数量证明必要性 |
| 后层机制侵入 M0/M1 | K0 永远无法冻结 | 核心层拒绝诊断、里程碑负向范围、G0 启动门 | 把实验语法当作稳定实现 |
| 可信启动悖论 | 第一版检查器错误污染全部证据 | 外部承载、语义差分、小检查器、独立路径和受控自举 | 用自举成功宣称正确 |
| 求解器不可靠 | 错误性质被标为已证明 | 证书与小型独立检查器 | 信任求解器退出码 |
| 后端破坏证明 | 源级正确但二进制错误 | 已验证后端或逐制品翻译验证 | 把“编译成功”写成端到端证明 |
| AI 通过扩大权限修复 | 局部通过但系统风险上升 | 权限/效果/假设升级审批 | 把权限变化混入普通补丁 |
| 互操作污染安全边界 | 外部动态行为进入安全核心 | 最小适配层、假设传递、沙箱 | 宣称“原生兼容”并隐藏运行时 |
| 适配器维护成本过高 | 生态接入停滞或绕过边界 | A0/A1 标准模板、官方参考实现、等级验证 | 为兼容性开放任意构建脚本 |
| 审计信息过载 | 高风险变化淹没在生成差异中 | R0 至 R3 风险排序、强制置顶、机器过滤 | 只提供源码 diff 或单一风险分数 |
| 字节复现脆弱 | 无语义变化的构建被误判失败 | 语义/字节复现分级、不确定来源清单 | 降低语义可复现要求 |
| 语义身份不稳定 | 大规模补丁冲突、证明缓存失效 | 规范 ASR、稳定义务 ID、语义哈希 | 仅依赖行号 |
| 长期格式腐化 | 历史证明无法重放 | 开放格式、独立读取器、最小重放包 | 只保存云服务链接 |
| 过度追求人类语法便利 | 引入歧义与隐式行为 | 唯一格式、显式语义、审计视图 | 用语法糖隐藏控制和资源 |
| 性能保证空泛 | 无法用于底层系统 | 成本定位、等价基准、布局和效果报告 | 只给平均跑分 |

---

## 23. 治理与核心变更规则

### 23.1 核心变更提案必须回答

1. 它保护哪条第一性原理或核心不变量？
2. 为什么库、`comptime`、生成器、适配器或目标描述不能解决？
3. 它对形式语义、类型健全性和证明逻辑增加了什么？
4. 它是否引入隐式控制、分配、权限、非确定性或运行时？
5. 它如何进入 ASR、语义哈希、诊断和语义差异？
6. 它如何影响旧证明、旧制品和迁移？
7. 它的正向、负向和对抗性测试是什么？
8. 删除该机制会破坏什么不可替代的能力？
9. 它属于 K0、K1、K2a 还是 K2b，为什么不能后移一层？
10. 它与哪些现有机制组合产生新保证，并删除了哪些专用规则？
11. 下一阶段参考解释器如何跑通它的最小正向与负向样例？

任一问题没有可验证答案时，提案停留在扩展层。

### 23.2 兼容性

- 补丁版本不得改变规范语义或 ASR 规范化结果；
- 次版本可以增加工具能力和向后兼容的库接口；
- 语言语义变化必须进入 edition 或主版本；
- 旧 edition 的检查器和只读制品支持必须长期保留；
- 自动迁移必须显示语义变化，不能以“格式升级”名义隐藏行为变化。

### 23.3 决策权重

冲突时按以下顺序决策：

1. 健全性与权限边界；
2. 确定性与长期可重放；
3. 模块化证明与可组合性；
4. 资源和成本可见性；
5. AI 生成、修复和审计效率；
6. 原生运行性能；
7. 人类手写便利；
8. 与既有生态的表面相似度。

---

## 24. 待冻结的工程决策

以下事项必须在对应里程碑冻结，但它们不能推翻本文核心不变量：

| 决策 | 最晚阶段 | 选择约束 |
|---|---|---|
| 第一阶段承载语言/子集和初始信任清单 | G0 | 可审计、工具链固定、不得被描述为已证明 |
| K0 核心演算和元理论框架 | M0 | 只表达顺序所有权、借用、仿射资源、分配和错误；检查规则足够小 |
| K0 ASR 二进制/文本编码 | M0 | 开放、规范化、可演化、支持未知字段策略 |
| ASCII 标识符与 UTF-8 字符串词法 | M0 | 无同形歧义、跨实现一致、公开 API 可审计 |
| 整数精确运算的表层记法 | M0 | 溢出模式不隐式，证明义务可见 |
| K1 线性消费、Capability 和封闭效果包含 | M2 | 共享同一所有权流动关系，不引入第二套资源系统 |
| K1 `Own<T, A>` 与递归名义类型 | M2 | 显式分配、失败可见、复用借用规则、足以构造计算通用性见证 |
| trait 一致性和包级实现规则 | M2 | 依赖图变化不能静默改变实现选择 |
| 证明证书格式与内核逻辑 | M2 | 离线、确定、可独立实现、版本可迁移 |
| K2a 顺序一致并发内存模型 | M3 | 正式定义、数据竞争自由，不提前加入弱内存顺序 |
| 任务取消与失败聚合协议 | M3 | 无隐式析构、资源闭包、所有路径确定 |
| 首个目标 IR 与翻译验证策略 | M4 | 不夸大保证、可逐步缩小后端假设 |
| 语义/字节复现状态编码 | M4 | 两类状态分离，所有字节不确定来源可查询 |
| 包签名和信任策略 | M4 | 身份信任与语义证明严格分离 |
| K2b 效果多态、协议和弱内存映射 | M6 | 先证明库/K2a 不足，且通过 E0 减法评审 |

这些不是愿景空白，而是受约束的工程选择。冻结前必须用规范原型和反例验证，不得靠偏好投票决定。

---

## 25. 发布检查清单

任一 Aether 稳定版本发布前必须回答“是”：

- [ ] 语言内核中的每个机制都能追溯到第一性原理。
- [ ] 每个机制通过 E0 正交性与减法审查，并标明所属核心层。
- [ ] 没有领域名词进入核心类型或关键字。
- [ ] 所有表层语法都有唯一解析和唯一降低。
- [ ] 安全子集没有已知未定义行为路径。
- [ ] 所有权、线性资源、效果和 Capability 规则具备负向测试。
- [ ] 契约证明可由独立内核离线重放。
- [ ] 非空洞检查真实标明“通过/失败/未执行”；`critical` 闭包全部通过或已显式审批。
- [ ] 假设、`unsafe`、外部边界和后端状态完整可查。
- [ ] 固定输入的核心 IR、接口与证明结果语义可复现；字节复现状态和不确定来源准确。
- [ ] AI 可以只使用结构化协议完成生成-修复闭环。
- [ ] 意图清单与形式契约的双向缺口已经列出并审批。
- [ ] 人类可以在不阅读全部文本差异时识别权限和保证变化。
- [ ] R0 变化置顶且不可被折叠，A0/A1 适配器等级经过行为验证。
- [ ] 二进制能够追溯到语义哈希、证明、假设和构建输入。
- [ ] 旧制品和旧证明不会被迁移过程覆盖。
- [ ] 性能回归可以定位到具体语义成本。
- [ ] 任何新增语法糖都未隐藏分配、控制、失败或权限。
- [ ] 文档没有用场景数量替代机制必要性论证。
- [ ] 可信启动阶段、独立检查路径和残余外部信任假设完整披露。

---

## 26. 最终产品判据

Aether 成立的判据不是它内置了多少领域能力，也不是它看起来综合了多少现有语言。它成立，当且仅当以下链条闭合：

1. AI 接收的是可检查的意图边界，而不只是自然语言愿望；
2. AI 生成的程序无法绕过资源、权限和效果规则；
3. 关键性质从契约形成证明义务，并由独立内核检查；
4. 模块可以依靠接口、证书和显式假设进行组合；
5. 编译和优化不会把已证明源码变成未经说明的目标行为；
6. 最终制品携带足以审计和重放其信任来源的证据；
7. 数十年后，即使作者、模型、求解器和在线仓库都已消失，仍能判断该制品为什么被接受。

核心立场保持不变：

> 未来代码主要由 AI 书写。Aether 是为这一前提设计的、最小且最硬的可信计算根基。

---

## 27. 需求可追溯矩阵

本矩阵用于防止后续实现把第一性原理退化为口号。每条原理至少对应一组规范需求、一类发布证据和一个里程碑退出条件。

| 原理 | 主要需求 | 发布证据 | 首次闭合阶段 |
|---|---|---|---|
| E0 涌现优先 | `EMERGE-*`、`CORE-LAYER-*`、第 6.5 和 23.1 节 | 核心层归属、减法报告、解释器测试 | M0，此后持续 |
| P1 不信任作者 | `VERIFY-001` 至 `VERIFY-028`、`VERIFY-LEVEL-*`、`AI-INT-*` | 分级证据、证书、非空洞状态、意图缺口 | M1 的 B0，M2 的 B1 |
| P2 资源有限 | `LANG-OWN-*`、`LANG-MEM-*` | 消费路径、分配效果、资源上界 | M1 仿射，M2 线性，M3 任务资源 |
| P3 权限是资源 | `LANG-EFF-001` 至 `LANG-EFF-014` | 能力来源、授予记录、效果闭包 | M2 |
| P4 正确性需组合 | `VERIFY-001` 至 `VERIFY-016`、策略继承 | 接口证书、依赖保障与假设闭包 | M2 |
| P5 并发和失败常态化 | `LANG-CF-*`、`LANG-CON-*` | 错误穷尽、任务消费、SC 并发证据 | M1 错误，M3 K2a |
| P6 长期演化 | `ART-001` 至 `ART-005`、`TOOL-BUILD-*` | 最小重放包、规范和工具哈希 | M4，M5 独立验证 |
| P7 AI 结构化生成 | `AI-*`、`AI-INT-*`、`AUDIT-*` | ASR、语义补丁、风险视图、意图哈希 | M4 |
| P8 最小可信基 | `BOOT-*`、`VERIFY-009` 至 `VERIFY-016`、第 6.3、6.4 和 8.7 节 | 启动阶段、独立检查器、翻译验证状态 | M2 阶段 C 检查器，M5 信任链 |
| P9 跨介质资源结构 | `LANG-OWN-004` 至 `LANG-OWN-009`、第 13.2 节 | 库定义资源的线性消费；协议先在库验证 | M2，K2b 非强制 |
| P10 优化不得偷换语义 | `LANG-SEM-*`、第 8.7 和 11.4 节 | 优化等价证据、后端状态、差分测试 | M4，M5 闭合 |
| G8 计算通用性 | `EXEC-001` 至 `EXEC-008` | 二计数器机编码、模拟关系和参考轨迹 | M2/K1 |

若一项实现工作不能映射到此矩阵或明确的用户故事，它默认不进入核心路线；若一条原理失去发布证据或退出条件，版本不得宣称满足本 PRD。

---

## 28. 当前实现判定

### 28.1 Go/No-Go 结论

| 工作 | 当前判定 | 理由 |
|---|---|---|
| 完整语言与生产编译器 | **No-Go** | K1/K2、证明内核和后端信任链尚未形成规范制品 |
| 正式 K0 实现 | **No-Go，等待 G0** | PRD 已确定边界，但形式语义、ASR 模式和一致性语料尚未实际交付 |
| 可丢弃 K0 语义探针 | **Go** | 可用于验证移动、借用、分配、错误与解释语义，不承诺兼容性 |
| 领域库或外部生态集成 | **No-Go** | 现在启动会让应用需求反向绑架尚未冻结的 K0 |

### 28.2 G0 前仍需交付的四件套

1. **K0 语义规范**：值、类型、位置、移动、借用、仿射丢弃、分配/释放、错误和 `unsafe` 的推导规则与操作语义。
2. **K0 ASR 规范**：版本化模式、规范序列化、语义哈希、稳定诊断位置和文本往返规则。
3. **K0 一致性语料**：每个机制的正向、负向、边界、随机生成和差分执行样例。
4. **可信承载 ADR**：第一实现语言/子集、依赖、工具链锁定、审计范围、独立实现计划和初始假设。

四件套必须先独立评审，再允许正式代码结构成为长期兼容承诺。它们可以并行起草，但任何实现结果都不能替代规范决策。

### 28.3 K0 必须先回答的语义问题

- 借用有效期基于控制流活跃性还是严格词法块，以及跨分支合并规则；
- 部分移动、部分初始化和聚合值销毁的精确定义；
- 仿射分配句柄被丢弃时是允许显式泄漏、静态警告还是策略错误；K0 不得谎称已由仿射性保证“绝不泄漏”；
- 分配器返回值、释放操作与借用存活之间的关系；
- 整数精确运算证明失败在 K0 中是静态拒绝还是必须改写为 `checked_*`；
- `unsafe` 是否进入 K0 公开表层，还是只作为解释器内部宿主边界；
- 契约在 K0 中只解析/哈希，哪些最小一致性错误仍应静态拒绝；
- 模块初始化、全局常量和目标相关 `usize` 的可观察语义。

这些问题都可能改变类型健全性或可观察行为，不能留给编译器作者自行选择。G0 评审必须逐项形成不可歧义决定、反例和迁移影响。

### 28.4 实现纪律

历史使命不能成为跳过验证的理由。Aether 的实现顺序必须是：

`冻结一个小命题 -> 写出反例 -> 实现检查/解释 -> 差分验证 -> 扩大一层`

不允许采用：

- 先搭建完整编译器目录，再回填语义；
- 先接入大型后端或包生态，再定义 K0；
- 以原型已经工作为理由冻结偶然语法；
- 以 AI 能自动修复为理由容忍不健全规则；
- 以愿景紧迫为理由同时推进 K0、K1 和 K2。

完成 G0 后，应立即启动正式 K0 参考解释器和检查器；在此之前只做可删除的语义实验。
