<script setup lang="ts">
/**
 * ContentDetail.vue - 新闻/公告通用详情页
 *
 * 设计决策：新闻详情和公告详情使用同一组件，而非分别创建两个文件。
 * 原因：
 *   1. 两者的页面布局、交互逻辑完全一致，仅有数据来源不同
 *   2. 避免代码重复，降低维护成本
 *   3. 通过 route.path 自动判断类型（'/news' vs '/notice'），无需额外传参
 *   4. 若未来两类详情产生差异，可随时拆分为两个组件，成本很低
 *
 * 路由：/news/:id   /notice/:id
 */

import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElEmpty } from 'element-plus'
import { ArrowLeft, View, Clock, OfficeBuilding } from '@element-plus/icons-vue'

// 封面图资源（与轮播图共用）
const coverImage1 = new URL('@/assets/images/Carousel Images/1.jpg', import.meta.url).href
const coverImage2 = new URL('@/assets/images/Carousel Images/2.jpg', import.meta.url).href
const coverImage3 = new URL('@/assets/images/Carousel Images/3.jpeg', import.meta.url).href

const route = useRoute()
const router = useRouter()

// ============================================================
// 类型定义
// ============================================================
interface ContentDetail {
  id: number
  title: string
  coverImage?: string // 封面图（可选）
  content: string // 富文本 HTML
  publishTime: string
  source: string
  attachments?: Array<{ name: string; url: string }>
  viewCount?: number
}

// ============================================================
// 根据路由路径判断类型
// ============================================================
const contentType = computed<'news' | 'notice'>(() => {
  return route.path.includes('/notice') ? 'notice' : 'news'
})

const typeLabel = computed(() => (contentType.value === 'news' ? '党建新闻' : '通知公告'))

// ============================================================
// 状态
// ============================================================
const loading = ref(true)
const detail = ref<ContentDetail | null>(null)

// ============================================================
// Mock 详情数据
// TODO: 替换为真实 API 调用
// ============================================================
const mockNewsDetailMap: Record<number, ContentDetail> = {
  1: {
    id: 1,
    title: '习近平：在庆祝中国共产党成立105周年大会上的讲话',
    coverImage: coverImage1,
    content: `
      <p>同志们，朋友们：</p>
      <p>今天，我们在这里隆重集会，庆祝中国共产党成立105周年，回顾党的光辉历程，展望中华民族伟大复兴的光明前景。</p>
      <p><strong>一、党的百年奋斗历程</strong></p>
      <p>中国共产党自成立以来，始终把为中国人民谋幸福、为中华民族谋复兴作为自己的初心使命。一百零五年来，党领导人民经过波澜壮阔的伟大斗争，取得了举世瞩目的伟大成就。</p>
      <p>从新民主主义革命的伟大胜利，到社会主义革命和建设的伟大成就，再到改革开放和社会主义现代化建设的伟大飞跃，党始终是中国人民最可靠的主心骨。</p>
      <p><strong>二、新时代的历史性成就</strong></p>
      <p>进入新时代以来，在以习近平同志为核心的党中央坚强领导下，党和国家事业取得历史性成就、发生历史性变革：</p>
      <ul>
        <li>全面建成小康社会，历史性地解决了绝对贫困问题</li>
        <li>全面深化改革，国家治理体系和治理能力现代化水平显著提升</li>
        <li>全面从严治党，党的自我净化、自我完善、自我革新、自我提高能力显著增强</li>
        <li>推进生态文明建设，美丽中国建设迈出重大步伐</li>
      </ul>
      <p><strong>三、以中国式现代化推进中华民族伟大复兴</strong></p>
      <p>党的二十大擘画了全面建设社会主义现代化国家、以中国式现代化全面推进中华民族伟大复兴的宏伟蓝图。中国式现代化是人口规模巨大的现代化，是全体人民共同富裕的现代化，是物质文明和精神文明相协调的现代化，是人与自然和谐共生的现代化，是走和平发展道路的现代化。</p>
      <p>让我们更加紧密地团结在以习近平同志为核心的党中央周围，不忘初心、牢记使命，为实现中华民族伟大复兴的中国梦而不懈奋斗！</p>
    `,
    publishTime: '2026-07-01 09:00:00',
    source: '新华社',
    viewCount: 15230,
    attachments: [
      { name: '讲话全文.pdf', url: '#' },
      { name: '学习要点摘编.docx', url: '#' },
    ],
  },
  2: {
    id: 2,
    title: '学校召开2026年党建工作会议 部署下半年重点工作',
    coverImage: coverImage2,
    content: `
      <p>7月18日上午，学校在行政楼第一会议室召开2026年党建工作会议，全面总结上半年党建工作成效，研究部署下半年重点任务。</p>
      <p>校党委书记出席会议并讲话。党委各部门负责人、各二级党组织书记参加会议。</p>
      <p><strong>会议指出</strong>，2026年上半年，学校党建工作坚持以习近平新时代中国特色社会主义思想为指导，全面落实新时代党的建设总要求，在以下方面取得显著成效：</p>
      <ul>
        <li>理论武装持续深化，开展各类学习研讨活动120余场次</li>
        <li>基层党组织建设不断加强，"三会一课"质量持续提升</li>
        <li>党员发展和教育管理工作扎实推进，新发展党员85名</li>
        <li>党风廉政建设深入推进，营造风清气正的政治生态</li>
      </ul>
      <p><strong>会议强调</strong>，下半年要重点抓好以下工作：</p>
      <p><strong>一是</strong>深入学习贯彻党的二十届三中全会精神，将其作为当前和今后一个时期的首要政治任务。要精心组织学习培训，广泛开展宣传宣讲，推动全会精神入脑入心。</p>
      <p><strong>二是</strong>持续推进党支部标准化规范化建设。严格落实《中国共产党普通高等学校基层组织工作条例》，以"对标争先"创建为抓手，打造一批标杆党支部。</p>
      <p><strong>三是</strong>加强党员发展和教育管理。严格党员发展程序，确保发展质量；创新党员教育方式，利用信息化手段提升教育实效。</p>
      <p><strong>四是</strong>深化"党建+"融合模式。推动党建工作与人才培养、科学研究、社会服务深度融合，以高质量党建引领高质量发展。</p>
      <p>会议号召，全校各级党组织和全体党员要以更加昂扬的斗志、更加务实的作风，不断开创学校党建工作新局面。</p>
    `,
    publishTime: '2026-07-18 14:30:00',
    source: '党委组织部',
    viewCount: 3256,
    attachments: [
      { name: '2026年下半年党建工作要点.pdf', url: '#' },
    ],
  },
  3: {
    id: 3,
    title: '我院举办"学习二十大精神"主题党日活动',
    content: `
      <p>7月15日下午，计算机学院学生第一党支部在学院楼A座301会议室举办"学习二十大精神"主题党日活动。支部全体党员、预备党员及部分积极分子代表共40余人参加活动。</p>
      <p>活动在庄严的国歌声中拉开帷幕。支部书记首先带领大家重温入党誓词，全体党员面向党旗，庄严宣誓，进一步坚定了理想信念。</p>
      <p><strong>专题学习环节</strong></p>
      <p>支部书记以《深入学习领会党的二十大报告精神》为题作专题辅导，从"过去五年的工作和新时代十年的伟大变革""开辟马克思主义中国化时代化新境界""新时代新征程中国共产党的使命任务"等方面进行了系统讲解。</p>
      <p><strong>交流研讨环节</strong></p>
      <p>与会党员围绕"如何将二十大精神落实到学习和生活中"展开热烈讨论：</p>
      <ul>
        <li>张明同志表示，要将二十大精神融入科研实践，努力攻克"卡脖子"技术难题</li>
        <li>李娟同志分享了学习心得，认为青年党员应当在科技创新中发挥先锋作用</li>
        <li>王磊同志结合自身实际，谈了如何在日常学习生活中践行党员使命</li>
      </ul>
      <p><strong>实践活动环节</strong></p>
      <p>支部还组织了"我为群众办实事"实践活动，全体党员到学院楼公共区域开展志愿服务，以实际行动践行为人民服务的宗旨。</p>
      <p>此次主题党日活动内容丰富、形式多样，进一步深化了支部党员对二十大精神的理解和把握，增强了支部的凝聚力和战斗力。</p>
    `,
    publishTime: '2026-07-15 16:00:00',
    source: '计算机学院学生第一党支部',
    viewCount: 1892,
    attachments: [],
  },
  4: {
    id: 4,
    title: '关于做好2026年度党员发展工作的通知',
    content: `
      <p>各党支部：</p>
      <p>为做好2026年度党员发展工作，根据《中国共产党发展党员工作细则》和上级有关要求，现将有关事项通知如下：</p>
      <p><strong>一、总体要求</strong></p>
      <p>坚持党章规定的党员标准，始终把政治标准放在首位；坚持慎重发展、均衡发展，有领导、有计划地进行；坚持入党自愿原则和个别吸收原则，成熟一个，发展一个。</p>
      <p><strong>二、发展计划</strong></p>
      <p>2026年度全校发展党员计划指标为200名，其中：</p>
      <ul>
        <li>上半年：120名</li>
        <li>下半年：80名</li>
      </ul>
      <p><strong>三、时间安排</strong></p>
      <ul>
        <li>7月-8月：确定发展对象，完成政治审查</li>
        <li>9月：开展集中培训（不少于24学时）</li>
        <li>10月：支部大会讨论接收预备党员</li>
        <li>11月：上级党组织审批</li>
        <li>12月：预备党员宣誓</li>
      </ul>
      <p><strong>四、工作要求</strong></p>
      <p>1. 严格程序。严格按照《中国共产党发展党员工作细则》规定的程序和要求，不得简化或变通。</p>
      <p>2. 确保质量。坚持把政治标准放在首位，综合考察发展对象的思想政治、能力素质、道德品行、现实表现。</p>
      <p>3. 规范材料。发展党员相关材料要齐全、规范，必须经党支部书记审核签字。</p>
      <p>4. 按时报送。各支部请于规定时间内将相关材料报送党委组织部。</p>
    `,
    publishTime: '2026-07-10 10:00:00',
    source: '党委组织部',
    viewCount: 8921,
    attachments: [
      { name: '党员发展工作细则.pdf', url: '#' },
      { name: '2026年度党员发展计划表.xlsx', url: '#' },
      { name: '发展对象培训方案.docx', url: '#' },
    ],
  },
  5: {
    id: 5,
    title: '党支部标准化规范化建设经验交流会在京召开',
    coverImage: coverImage3,
    content: `
      <p>7月5日，全国高校党支部标准化规范化建设经验交流会在北京召开。教育部有关负责同志出席会议并讲话。</p>
      <p><strong>会议主要内容</strong></p>
      <p>会议总结了近年来高校党支部标准化规范化建设的成效与经验，分析了存在的问题和不足，对下一步工作进行了部署。</p>
      <p>会议强调，党支部是党的基础组织，是党组织开展工作的基本单元。加强党支部标准化规范化建设，对于推动全面从严治党向基层延伸、提升基层党组织组织力具有重要意义。</p>
      <p><strong>典型经验交流</strong></p>
      <p>多所高校代表在会上作了经验交流发言，分享了在以下方面的典型做法：</p>
      <ul>
        <li>优化党支部设置，确保组织覆盖全面</li>
        <li>规范"三会一课"制度，提升组织生活质量</li>
        <li>加强党支部书记队伍建设，发挥"头雁"效应</li>
        <li>创新主题党日活动形式，增强吸引力感染力</li>
        <li>运用信息化手段，提升党建工作效率</li>
      </ul>
      <p><strong>会议指出</strong>，高校党支部建设要以提升组织力为重点，突出政治功能，教育引导党员深刻领悟"两个确立"的决定性意义，增强"四个意识"、坚定"四个自信"、做到"两个维护"。</p>
      <p>会议号召，各高校要以此次交流会为契机，认真学习借鉴先进经验，不断提升党支部建设质量。</p>
    `,
    publishTime: '2026-07-05 15:00:00',
    source: '教育部',
    viewCount: 12450,
    attachments: [
      { name: '经验交流材料汇编.pdf', url: '#' },
    ],
  },
  6: {
    id: 6,
    title: '2026年暑期大学生党员社会实践出征仪式举行',
    content: `
      <p>7月3日上午，2026年暑期大学生党员社会实践出征仪式在图书馆广场隆重举行。校党委领导、相关部门负责人及全体实践队成员参加仪式。</p>
      <p><strong>实践主题</strong></p>
      <p>本次暑期社会实践以"永远跟党走 奋进新征程"为主题，组织大学生党员深入基层、深入农村、深入社区，开展形式多样的社会实践活动。</p>
      <p><strong>实践内容</strong></p>
      <ul>
        <li><strong>红色寻访：</strong>参观革命旧址、红色教育基地，寻访老党员，传承红色基因</li>
        <li><strong>乡村振兴：</strong>赴对口帮扶乡村开展电商助农、文化支教等活动</li>
        <li><strong>社区服务：</strong>参与社区治理，为居民提供便民服务和政策宣讲</li>
        <li><strong>科技支农：</strong>发挥专业特长，为农业生产提供技术咨询和培训</li>
      </ul>
      <p><strong>队伍规模</strong></p>
      <p>本次共组建实践队20支，参与学生党员和入党积极分子共计300余人，覆盖全校12个学院。</p>
      <p>党委领导为各实践队授旗，并勉励同学们在社会实践中深入了解国情民情，锤炼党性修养，增强服务意识和责任担当。</p>
    `,
    publishTime: '2026-07-03 11:00:00',
    source: '校团委',
    viewCount: 5621,
    attachments: [],
  },
}

const mockNoticeDetailMap: Record<number, ContentDetail> = {
  1: {
    id: 1,
    title: '关于开展2026年第三季度思想汇报提交工作的通知',
    content: `
      <p>各党支部、全体入党积极分子、预备党员：</p>
      <p>根据《中国共产党发展党员工作细则》和《入党积极分子培养教育考察登记表》要求，现将2026年第三季度思想汇报提交工作安排通知如下：</p>
      <p><strong>一、提交对象</strong></p>
      <ul>
        <li>全体入党积极分子</li>
        <li>全体预备党员</li>
      </ul>
      <p><strong>二、提交时间</strong></p>
      <p>2026年9月1日至9月15日，逾期不再受理。</p>
      <p><strong>三、汇报内容</strong></p>
      <p>思想汇报应围绕以下方面展开：</p>
      <p>1. 近期学习党章、党的理论知识的收获和体会</p>
      <p>2. 对国内外时事政治的认识和看法</p>
      <p>3. 在学习、工作、生活中发挥先锋模范作用的情况</p>
      <p>4. 存在的不足及改进措施</p>
      <p>5. 需要向党组织说明的其他问题</p>
      <p><strong>四、格式要求</strong></p>
      <p>1. 字数不少于1500字</p>
      <p>2. 使用标准思想汇报格式，标题为"思想汇报"</p>
      <p>3. 手写或打印均可，手写须字迹工整</p>
      <p>4. 落款处须本人签名并注明日期</p>
      <p><strong>五、提交方式</strong></p>
      <p>提交至所在党支部书记处，由支部统一汇总后报送党委组织部。</p>
    `,
    publishTime: '2026-07-20 08:30:00',
    source: '党委组织部',
    viewCount: 7845,
    attachments: [
      { name: '思想汇报模板.docx', url: '#' },
      { name: '提交要求说明.pdf', url: '#' },
    ],
  },
  2: {
    id: 2,
    title: '关于组织观看党风廉政教育专题片的通知',
    content: `
      <p>各党支部：</p>
      <p>为深入推进党风廉政建设，增强党员干部廉洁自律意识，根据学校纪委工作安排，决定组织全体党员观看党风廉政教育专题片。现将有关事项通知如下：</p>
      <p><strong>一、观看内容</strong></p>
      <p>专题片《正风反腐就在身边》（共4集）</p>
      <p><strong>二、观看时间</strong></p>
      <p>2026年7月20日-7月27日，由各党支部自行组织安排。</p>
      <p><strong>三、观看方式</strong></p>
      <p>通过学校内部学习平台在线观看，或由各支部组织集体观看。</p>
      <p><strong>四、具体要求</strong></p>
      <p>1. 各党支部要高度重视，确保每位党员按时完成观看</p>
      <p>2. 观看后各支部须组织一次讨论交流，每名党员撰写心得体会一篇</p>
      <p>3. 心得体会不少于800字，于8月1日前以支部为单位提交至党委组织部</p>
      <p>4. 观看情况纳入年度党建考核</p>
    `,
    publishTime: '2026-07-17 16:00:00',
    source: '纪委办公室',
    viewCount: 6230,
    attachments: [
      { name: '观看指南.pdf', url: '#' },
    ],
  },
  3: {
    id: 3,
    title: '本周三下午党员活动室召开支部委员会会议',
    content: `
      <p>各位支部委员：</p>
      <p>定于本周三（7月16日）下午14:30在党员活动室（学院楼B座201）召开支部委员会会议，现将有关事项通知如下：</p>
      <p><strong>一、会议议题</strong></p>
      <ul>
        <li>1. 学习近期中央和上级党委重要文件精神</li>
        <li>2. 研究2026年第三季度支部工作计划</li>
        <li>3. 讨论接收预备党员事宜</li>
        <li>4. 审议入党积极分子培养情况</li>
        <li>5. 其他事项</li>
      </ul>
      <p><strong>二、参会人员</strong></p>
      <p>支部全体委员。请提前10分钟入场签到。</p>
      <p><strong>三、会议要求</strong></p>
      <p>1. 请各位委员提前阅知相关材料，做好发言准备</p>
      <p>2. 如因故不能参会，须提前向支部书记请假</p>
      <p>3. 会议期间请将手机调至静音或关闭状态</p>
    `,
    publishTime: '2026-07-16 09:00:00',
    source: '计算机学院学生第一党支部',
    viewCount: 1567,
    attachments: [],
  },
  4: {
    id: 4,
    title: '关于2026年上半年党费收缴情况的公示',
    content: `
      <p>各党支部、全体党员：</p>
      <p>根据《中国共产党党费收缴、使用和管理规定》，现将2026年上半年（1月-6月）党费收缴情况进行公示如下：</p>
      <p><strong>一、收缴概况</strong></p>
      <ul>
        <li>应缴党员人数：156人</li>
        <li>实缴党员人数：156人</li>
        <li>收缴率：100%</li>
        <li>党费总额：18,720元</li>
      </ul>
      <p><strong>二、各支部收缴明细</strong></p>
      <p>1. 计算机学院学生第一党支部：48人，收缴5,760元</p>
      <p>2. 计算机学院学生第二党支部：42人，收缴5,040元</p>
      <p>3. 软件学院学生党支部：36人，收缴4,320元</p>
      <p>4. 网络空间安全学院学生党支部：30人，收缴3,600元</p>
      <p><strong>三、公示说明</strong></p>
      <p>1. 公示期为2026年7月12日至7月18日</p>
      <p>2. 如有异议，请在公示期内向党委组织部反映</p>
      <p>3. 联系电话：010-XXXX-XXXX</p>
      <p>4. 电子邮箱：zzb@example.edu.cn</p>
    `,
    publishTime: '2026-07-12 11:00:00',
    source: '党委组织部',
    viewCount: 4500,
    attachments: [
      { name: '2026年上半年党费收缴明细表.xlsx', url: '#' },
    ],
  },
  5: {
    id: 5,
    title: '转发：关于进一步加强高校基层党组织建设的意见',
    content: `
      <p>各党支部：</p>
      <p>现将中共教育部党组印发的《关于进一步加强高校基层党组织建设的意见》转发给你们，请认真组织学习，结合实际抓好贯彻落实。</p>
      <p><strong>文件要点摘录：</strong></p>
      <p><strong>一、总体目标</strong></p>
      <p>以提升组织力为重点，突出政治功能，把高校基层党组织建设成为宣传党的主张、贯彻党的决定、领导基层治理、团结动员群众、推动改革发展的坚强战斗堡垒。</p>
      <p><strong>二、重点任务</strong></p>
      <ul>
        <li>强化政治引领。坚持用习近平新时代中国特色社会主义思想铸魂育人</li>
        <li>健全组织体系。优化基层党组织设置，确保党的工作全覆盖</li>
        <li>严格组织生活。认真落实"三会一课"、民主评议党员等制度</li>
        <li>建强骨干队伍。选优配强党支部书记，加强党务工作者队伍建设</li>
        <li>发挥党员作用。教育引导党员在教学科研、管理服务中当先锋、作表率</li>
      </ul>
      <p><strong>三、保障措施</strong></p>
      <p>1. 落实主体责任。高校党委要切实履行管党治党主体责任</p>
      <p>2. 加大经费投入。按规定落实基层党建工作经费保障</p>
      <p>3. 加强阵地建设。推进党员活动室标准化建设</p>
    `,
    publishTime: '2026-07-08 14:00:00',
    source: '教育部',
    viewCount: 9100,
    attachments: [
      { name: '关于进一步加强高校基层党组织建设的意见.pdf', url: '#' },
    ],
  },
  6: {
    id: 6,
    title: '暑期社会实践优秀党员志愿者表彰名单公示',
    content: `
      <p>根据《关于开展2026年暑期社会实践优秀党员志愿者评选工作的通知》，经个人申报、支部推荐、学院评审，现将拟表彰名单公示如下：</p>
      <p><strong>暑期社会实践优秀党员志愿者（共20名）</strong></p>
      <p><strong>计算机学院（5名）：</strong></p>
      <p>张明（20230101001）、李娟（20230101002）、王磊（20230101003）、赵婷（20230101004）、孙浩（20230101005）</p>
      <p><strong>软件学院（5名）：</strong></p>
      <p>周颖（20220201006）、吴强（20220201001）、郑雪（20220201002）、陈伟（20220201003）、刘洋（20220201004）</p>
      <p><strong>其他学院（10名，详见附件）</strong></p>
      <p><strong>公示说明：</strong></p>
      <p>1. 公示期：2026年7月4日 - 7月10日</p>
      <p>2. 如有异议，请在公示期内向校团委反映</p>
      <p>3. 联系电话：010-XXXX-XXXX</p>
      <p>4. 电子邮箱：tw@example.edu.cn</p>
      <p>希望受到表彰的同学珍惜荣誉、再接再厉，在今后的志愿服务中继续发挥先锋模范作用。</p>
    `,
    publishTime: '2026-07-04 10:00:00',
    source: '校团委',
    viewCount: 6780,
    attachments: [
      { name: '完整表彰名单.pdf', url: '#' },
      { name: '事迹材料汇编.pdf', url: '#' },
    ],
  },
}

// ============================================================
// 数据加载
// ============================================================
const detailId = computed(() => Number(route.params.id))

function getMockDetail(): ContentDetail | null {
  const map = contentType.value === 'news' ? mockNewsDetailMap : mockNoticeDetailMap
  return map[detailId.value] || null
}

async function loadDetail(): Promise<void> {
  loading.value = true
  try {
    // TODO: 替换为真实 API 调用
    // const res = contentType.value === 'news'
    //   ? await api.getNewsDetail(detailId.value)
    //   : await api.getNoticeDetail(detailId.value)
    await new Promise(resolve => setTimeout(resolve, 300))

    detail.value = getMockDetail()
  } finally {
    loading.value = false
  }
}

// ============================================================
// 返回上一页
// ============================================================
function goBack(): void {
  // 优先尝试返回上一页，若无法返回则跳转到首页
  if (window.history.length > 1) {
    router.back()
  } else {
    router.push('/')
  }
}

// ============================================================
// 格式化时间（只显示日期部分）
// ============================================================
function formatDate(dateStr: string): string {
  if (!dateStr) return '-'
  return dateStr.split(' ')[0]
}

// ============================================================
// 下载附件（Mock）
// ============================================================
function handleDownload(att: { name: string; url: string }): void {
  // TODO: 替换为真实下载逻辑
  console.log('[Mock] 下载附件：', att.name, att.url)
}

onMounted(() => {
  loadDetail()
})
</script>

<template>
  <div class="content-detail-page" v-loading="loading" element-loading-text="正在加载...">
    <div class="page-container">
      <!-- ==================== 空状态 ==================== -->
      <template v-if="!loading && !detail">
        <el-empty description="内容不存在或已被删除">
          <el-button type="primary" @click="goBack">返回上一页</el-button>
        </el-empty>
      </template>

      <!-- ==================== 详情内容 ==================== -->
      <template v-if="detail">
        <!-- 返回按钮 -->
        <div class="detail-topbar">
          <el-button text @click="goBack" class="back-btn">
            <el-icon><ArrowLeft /></el-icon>
            返回列表
          </el-button>
        </div>

        <!-- 文章卡片 -->
        <article class="content-card article-card">
          <!-- 封面图 -->
          <div v-if="detail.coverImage" class="article-cover">
            <img :src="detail.coverImage" :alt="detail.title" class="cover-image" />
          </div>

          <!-- 标题 -->
          <h1 class="article-title">{{ detail.title }}</h1>

          <!-- 元信息 -->
          <div class="article-meta">
            <span class="meta-item">
              <el-icon><Clock /></el-icon>
              {{ formatDate(detail.publishTime) }}
            </span>
            <span class="meta-item">
              <el-icon><OfficeBuilding /></el-icon>
              {{ detail.source }}
            </span>
            <span v-if="detail.viewCount !== undefined" class="meta-item">
              <el-icon><View /></el-icon>
              {{ detail.viewCount.toLocaleString() }} 次阅读
            </span>
          </div>

          <!-- 正文内容 -->
          <div class="article-body" v-html="detail.content"></div>

          <!-- 附件区域 -->
          <div v-if="detail.attachments && detail.attachments.length > 0" class="article-attachments">
            <h3 class="attachments-title">
              <span class="attachments-icon">📎</span>
              附件下载
            </h3>
            <ul class="attachments-list">
              <li
                v-for="(att, index) in detail.attachments"
                :key="index"
                class="attachment-item"
                @click="handleDownload(att)"
              >
                <span class="attachment-name">{{ att.name }}</span>
                <el-button size="small" type="primary" link class="attachment-download">
                  下载
                </el-button>
              </li>
            </ul>
          </div>
        </article>
      </template>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.content-detail-page {
  padding: 24px 0 40px;
  min-height: 60vh;
}

/* ==================== 返回按钮 ==================== */
.detail-topbar {
  margin-bottom: 16px;
}

.back-btn {
  padding-left: 0;
  color: var(--text-secondary);
  font-size: 14px;

  &:hover {
    color: var(--party-red);
  }
}

/* ==================== 文章卡片 ==================== */
.article-card {
  max-width: 860px;
  margin: 0 auto;
  padding: 40px 48px;

  @media (max-width: 768px) {
    padding: 24px 20px;
  }
}

/* ==================== 封面图 ==================== */
.article-cover {
  margin: -40px -48px 32px;
  border-radius: var(--radius-lg) var(--radius-lg) 0 0;
  overflow: hidden;

  @media (max-width: 768px) {
    margin: -24px -20px 24px;
    border-radius: 0;
  }
}

.cover-image {
  width: 100%;
  height: auto;
  max-height: 400px;
  object-fit: cover;
  display: block;
}

/* ==================== 标题 ==================== */
.article-title {
  font-size: 26px;
  font-weight: 700;
  color: var(--text-primary);
  line-height: 1.4;
  text-align: center;
  margin-bottom: 20px;

  @media (max-width: 768px) {
    font-size: 20px;
  }
}

/* ==================== 元信息 ==================== */
.article-meta {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 24px;
  padding-bottom: 24px;
  margin-bottom: 32px;
  border-bottom: 1px solid var(--border-color);
  flex-wrap: wrap;
}

.meta-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  color: var(--text-secondary);

  .el-icon {
    font-size: 15px;
  }
}

/* ==================== 正文内容 ==================== */
.article-body {
  font-size: 16px;
  line-height: 1.8;
  color: var(--text-regular);

  // 富文本样式覆盖
  :deep(p) {
    margin-bottom: 16px;
    text-indent: 2em;
  }

  :deep(strong) {
    color: var(--text-primary);
    font-weight: 600;
  }

  :deep(ul),
  :deep(ol) {
    margin: 12px 0 16px;
    padding-left: 2em;
  }

  :deep(li) {
    margin-bottom: 8px;
    list-style-type: disc;

    &:last-child {
      margin-bottom: 0;
    }
  }

  :deep(img) {
    max-width: 100%;
    height: auto;
    display: block;
    margin: 16px auto;
    border-radius: var(--radius-base);
  }

  :deep(h1),
  :deep(h2),
  :deep(h3) {
    margin: 24px 0 12px;
    color: var(--text-primary);
  }

  :deep(blockquote) {
    margin: 16px 0;
    padding: 12px 20px;
    border-left: 4px solid var(--party-red);
    background: var(--party-red-bg);
    color: var(--text-secondary);
  }
}

/* ==================== 附件区域 ==================== */
.article-attachments {
  margin-top: 40px;
  padding-top: 24px;
  border-top: 1px dashed var(--border-color);
}

.attachments-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 16px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.attachments-icon {
  font-size: 18px;
}

.attachments-list {
  list-style: none;
}

.attachment-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px;
  border-radius: var(--radius-base);
  background: var(--bg-page);
  margin-bottom: 8px;
  cursor: pointer;
  transition: background 0.2s;

  &:hover {
    background: var(--party-red-bg);

    .attachment-name {
      color: var(--party-red);
    }
  }

  &:last-child {
    margin-bottom: 0;
  }
}

.attachment-name {
  font-size: 14px;
  color: var(--text-regular);
  transition: color 0.2s;
}

.attachment-download {
  font-size: 13px;
}
</style>
