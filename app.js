// ===== Global State =====
let appData = { students: {}, currentClass: null, charts: {}, logs: [] };

// 内置数据版本：每次大批量更新花名册后递增，使老用户本地存储自动重新播种最新数据
const DATA_VERSION = 20260827;
// 体测年级参照学年：按 2026-09 开学（2026~2027 学年）推算各届学生当前年级
const REF_SCHOOL_YEAR = 2026;

// ===== Init =====
document.addEventListener('DOMContentLoaded', () => {
    // Load data from localStorage or use default
    loadAppData();
    initNavigation();
    initMobileNav();
    initHomeStats();
    initRoster();
    initAnalysis();
    initScoreEntry();
    initToolbox();
    initSafety();
    initExcelImport();
    initHomeCards();
    updateSeToolbar();
});

// ===== Data Management =====
function loadAppData() {
    const saved = localStorage.getItem('pe_workbench_data');
    const seed = () => {
        appData.students = JSON.parse(JSON.stringify(STUDENT_DATA));
        appData.currentClass = Object.keys(appData.students)[0];
        appData.logs = [];
        saveAppData();
    };
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            if (parsed && parsed.version === DATA_VERSION && parsed.students) {
                appData.students = parsed.students;
                appData.currentClass = parsed.currentClass || Object.keys(appData.students)[0];
                appData.logs = parsed.logs || [];
            } else {
                // 版本不一致（如本次全校花名册大批量导入）→ 以最新内置数据重新播种
                seed();
            }
        } catch(e) {
            seed();
        }
    } else {
        seed();
    }
    // 每个学生补上 grade（导入时已写入则保留，否则由班级名解析），供逐年级评分使用
    Object.keys(appData.students).forEach(k => {
        const g = gradeOfClass(k);
        (appData.students[k] || []).forEach(s => { if (s.grade == null) s.grade = g; });
    });
}

function saveAppData() {
    localStorage.setItem('pe_workbench_data', JSON.stringify({
        version: DATA_VERSION,
        students: appData.students,
        currentClass: appData.currentClass,
        logs: appData.logs,
    }));
}

// ===== Navigation =====
function initNavigation() {
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', () => {
            const page = item.dataset.page;
            navigateTo(page);
        });
    });
}

function navigateTo(page) {
    const pageNames = { home: '工作台首页', roster: '学生花名册', analysis: '体测数据管理', scoreentry: '成绩录入', toolbox: '教学工具箱', safety: '安全应急预案', studentmgmt: '学生管理' };
    
    // Update sidebar
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    const sidebarItem = document.querySelector(`.nav-item[data-page="${page}"]`);
    if (sidebarItem) sidebarItem.classList.add('active');
    
    // Update pages
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    const pageEl = document.getElementById('page-' + page);
    if (pageEl) pageEl.classList.add('active');
    document.body.classList.toggle('page-scoreentry-active', page === 'scoreentry');
    
    // Update mobile title
    const mobileTitle = document.getElementById('mobilePageTitle');
    if (mobileTitle) mobileTitle.textContent = pageNames[page] || page;
    
    // Update bottom nav
    document.querySelectorAll('.bottom-nav-item').forEach(b => b.classList.remove('active'));
    const bottomItem = document.querySelector(`.bottom-nav-item[data-page="${page}"]`);
    if (bottomItem) bottomItem.classList.add('active');
    
    // Close sidebar on mobile
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebarBackdrop').classList.remove('show');
    
    // Refresh data on page load
    if (page === 'roster') renderRoster();
    if (page === 'analysis') renderAnalysis();
    if (page === 'scoreentry') renderScoreEntry();
    if (page === 'toolbox') renderToolbox();
    if (page === 'studentmgmt') renderStudentMgmt();
}

// ===== Mobile Navigation =====
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const backdrop = document.getElementById('sidebarBackdrop');
    sidebar.classList.toggle('open');
    backdrop.classList.toggle('show');
}

function initMobileNav() {
    // Bottom nav clicks
    document.querySelectorAll('.bottom-nav-item').forEach(item => {
        item.addEventListener('click', () => {
            const page = item.dataset.page;
            navigateTo(page);
            // Scroll to top
            document.getElementById('mainContent').scrollTop = 0;
        });
    });
    
    // Close sidebar on backdrop tap
    document.getElementById('sidebarBackdrop').addEventListener('click', () => {
        document.getElementById('sidebar').classList.remove('open');
        document.getElementById('sidebarBackdrop').classList.remove('show');
    });
}

// ===== Toast =====
function showToast(msg, type = '') {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.className = 'toast show ' + type;
    setTimeout(() => toast.classList.remove('show'), 2500);
}

// ===== Modal =====
function openModal(id) { document.getElementById(id).classList.add('show'); }
function closeModal(id) { document.getElementById(id).classList.remove('show'); }

// ===== Score Calculation（官方《国家学生体质健康标准（2014修订版）》逐年级查表） =====
function sexKey(gender) { return gender === '女' ? 'F' : 'M'; }

// 在 [score, value] 锚点数组上线性插值；anchors 已按 score 降序排列
function scoreFromTable(anchors, value, lowerIsBetter) {
    if (!anchors || !anchors.length) return null;
    const best = anchors[0], worst = anchors[anchors.length - 1];
    if (lowerIsBetter) {
        if (value <= best[1]) return best[0];
        if (value >= worst[1]) {
            const prev = anchors[anchors.length - 2];
            const sc = worst[0] + (worst[0] - prev[0]) / (worst[1] - prev[1]) * (value - worst[1]);
            return Math.max(0, Math.round(sc));
        }
        for (let i = 0; i < anchors.length - 1; i++) {
            const hi = anchors[i], lo = anchors[i + 1];
            if (value >= hi[1] && value <= lo[1]) {
                const t = (value - hi[1]) / (lo[1] - hi[1]);
                return Math.round(hi[0] + t * (lo[0] - hi[0]));
            }
        }
    } else {
        if (value >= best[1]) return best[0];
        if (value <= worst[1]) {
            const prev = anchors[anchors.length - 2];
            const sc = worst[0] + (worst[0] - prev[0]) / (worst[1] - prev[1]) * (value - worst[1]);
            return Math.max(0, Math.round(sc));
        }
        for (let i = 0; i < anchors.length - 1; i++) {
            const hi = anchors[i], lo = anchors[i + 1];
            if (value >= lo[1] && value <= hi[1]) {
                const t = (value - lo[1]) / (hi[1] - lo[1]);
                return Math.round(lo[0] + t * (hi[0] - lo[0]));
            }
        }
    }
    return worst[0];
}

// 取某年级某项目的锚点（低年级未测项目回退到最早有标准的年级）
function getScoreTable(item, grade, gender) {
    let gg = grade || 1;
    if (item === 'sitUps' && gg < 3) gg = 3;
    if (item === 'run50x8' && gg < 5) gg = 5;
    const tbl = NATION_SCORE[gg];
    if (!tbl || !tbl[item]) return null;
    return tbl[item][sexKey(gender)] || null;
}

// BMI 分级得分：正常=100，低体重/超重=80，肥胖=60
function getBmiScore(grade, gender, bmi) {
    const r = NATION_SCORE[grade]?.bmi?.[sexKey(gender)];
    if (!r || bmi == null || isNaN(bmi)) return null;
    if (bmi < r.under) return 80;        // 低体重
    if (bmi < r.normal[1]) return 100;   // 正常
    if (bmi < r.over[1]) return 80;      // 超重
    return 60;                           // 肥胖
}

function getBmiCategory(value, gender, grade) {
    const r = NATION_SCORE[grade]?.bmi?.[sexKey(gender)];
    if (!r) return { label: '-', level: 'none' };
    if (value < r.under) return { label: '低体重', level: 'weak' };
    if (value < r.normal[1]) return { label: '正常', level: 'good' };
    if (value < r.over[1]) return { label: '超重', level: 'weak' };
    return { label: '肥胖', level: 'weak' };
}

// 百分制得分（按官方表查表 + 相邻档线性插值，跳绳超满分可加分封顶 +20）
function getScore100(item, value, gender, grade) {
    if (value === null || value === undefined || value === '' || isNaN(value)) return null;
    if (item === 'bmi') return getBmiScore(grade, gender, parseFloat(value));
    const anchors = getScoreTable(item, grade, gender);
    if (!anchors) return null;
    const lowerIsBetter = !!TEST_ITEMS[item]?.lowerIsBetter;
    const base = scoreFromTable(anchors, parseFloat(value), lowerIsBetter);
    if (base == null) return null;
    if (item === 'skipRope') {
        const bestVal = anchors[0][1];
        if (parseFloat(value) > bestVal) {
            const bonus = Math.min(20, Math.floor((parseFloat(value) - bestVal) / 2));
            return Math.min(120, base + bonus);
        }
    }
    return base;
}

// 等级：由百分制得分反推（≥90 优秀，80-89 良好，60-79 及格，<60 不及格）
function scoreBand(score100) {
    if (score100 == null) return 'none';
    if (score100 >= 90) return 'excellent';
    if (score100 >= 80) return 'good';
    if (score100 >= 60) return 'pass';
    return 'weak';
}

function getScoreLevel(item, value, gender, grade) {
    if (value === null || value === undefined || value === '' || isNaN(value)) return 'none';
    return scoreBand(getScore100(item, value, gender, grade));
}

function getBmiLabel(value, gender, grade) { return getBmiCategory(value, gender, grade).label; }
function getBmiLevel(value, gender, grade) { return getBmiCategory(value, gender, grade).level; }

// 由身高(cm) + 体重(kg) 计算 BMI（保留 1 位），缺一项返回 null
function calcBmi(s) {
    if (s.height == null || s.height === '' || s.weight == null || s.weight === '') return null;
    const h = parseFloat(s.height), w = parseFloat(s.weight);
    if (isNaN(h) || isNaN(w) || h <= 0) return null;
    return +(w / Math.pow(h / 100, 2)).toFixed(1);
}

// 取锚点上 满分/优秀(90)/良好(80)/及格(60) 对应的实测值，用于展示标准线
function getStdThresholds(item, grade, gender) {
    const anchors = getScoreTable(item, grade, gender);
    if (!anchors) return null;
    const at = sc => { const a = anchors.find(x => x[0] === sc); return a ? a[1] : null; };
    return { 满分: at(100), 优秀: at(90), 良好: at(80), 及格: at(60) };
}

// 国标加权总分（国家学生体质健康标准·小学）：总分 = Σ(单项得分 × 权重)
const NATION_WEIGHTS = {
  1: { bmi: 15, lung: 15, run50: 20, sitReach: 30, skipRope: 20 },
  2: { bmi: 15, lung: 15, run50: 20, sitReach: 30, skipRope: 20 },
  3: { bmi: 15, lung: 15, run50: 20, sitReach: 20, sitUps: 20, skipRope: 10 },
  4: { bmi: 15, lung: 15, run50: 20, sitReach: 20, sitUps: 20, skipRope: 10 },
  5: { bmi: 15, lung: 15, run50: 20, sitReach: 10, sitUps: 20, run50x8: 10, skipRope: 10 },
  6: { bmi: 15, lung: 15, run50: 20, sitReach: 10, sitUps: 20, run50x8: 10, skipRope: 10 },
};
// 某年级实际参与评分的项目（含肺活量；5-6年级含 50×8 折返跑）
// 初中(7/8/9)等暂无国标评分标准的年级返回空数组，界面显示「待补充评分标准」
function getActiveItems(grade) {
  if (!NATION_WEIGHTS[grade]) return [];
  return Object.keys(NATION_WEIGHTS[grade]);
}
// 计算加权总分与等级；缺项时按已测项权重归一化得「预估总分」并标注
function getOverallScore(student) {
  const grade = student.grade;
  const w = NATION_WEIGHTS[grade];
  if (!w) return { total: null, level: 'unsupported', complete: false, missing: [], unsupported: true };
  let sum = 0, wSum = 0; const missing = [];
  for (const item of Object.keys(w)) {
    const val = (item === 'bmi') ? calcBmi(student) : student[item];
    if (val == null || val === '' || isNaN(parseFloat(val))) { missing.push(item); continue; }
    const sc = getScore100(item, parseFloat(val), student.gender, grade);
    if (sc == null) { missing.push(item); continue; }
    sum += sc * w[item]; wSum += w[item];
  }
  if (wSum === 0) return { total: null, level: 'none', complete: false, missing };
  // 加权平均分 = Σ(单项得分×权重) / Σ(已测项权重)，缺项时按已测项自动归一化即为预估总分
  const total = Math.round(sum / wSum);
  let level = 'weak';
  if (total >= 90) level = 'excellent';
  else if (total >= 80) level = 'good';
  else if (total >= 60) level = 'pass';
  return { total, level, complete: missing.length === 0, missing };
}

function getOverallLevel(student) {
    if (student.excused) return 'excused';
    return getOverallScore(student).level;
}

const LEVEL_LABELS = { excellent: '优秀', good: '良好', pass: '及格', weak: '薄弱', none: '未测', unsupported: '待补充标准', excused: '免测' };
const LEVEL_COLORS = { excellent: '#4CAF50', good: '#2196F3', pass: '#FF9800', weak: '#f44336', none: '#9E9E9E', unsupported: '#9E9E9E', excused: '#8E24AA' };

// ===== Home Stats =====
function initHomeStats() {
    const totalStudents = Object.values(appData.students).reduce((sum, list) => sum + list.length, 0);
    const totalClasses = Object.keys(appData.students).length;
    const gameCount = (typeof GAMES !== 'undefined' && GAMES.length) ? GAMES.length : 0;

    document.getElementById('homeStats').innerHTML = `
        <div class="header-stat">📊 ${totalClasses}个班级</div>
        <div class="header-stat">👥 <span class="stat-val">${totalStudents}</span> 名学生</div>
        <div class="header-stat">🎮 ${gameCount} 个课堂游戏</div>
    `;
}

// ===== Home Cards =====
function initHomeCards() {
    const routineCards = [
        { id: 'roster', icon: '👥', title: '学生花名册管理', desc: '批量导入/手动录入学生信息，关联体测历史、课堂表现、体能短板标记', tag: '花名册+体测', color: '#4CAF50', bg: '#E8F5E9' },
        { id: 'analysis', icon: '📊', title: '体测成绩分析表', desc: '自动同步花名册体测数据，生成班级统计、个人趋势、薄弱预警', tag: '自动同步', color: '#42A5F5', bg: '#E3F2FD' },
        { id: 'scoreentry', icon: '📝', title: '成绩录入', desc: '测试日现场批量录入：选年级/班级→选项目→自动分道次→边测边录', tag: '现场录入', color: '#FF7043', bg: '#FBE9E7' },
        { id: 'toolbox', icon: '🧰', title: '教学工具箱', desc: '训练计划生成器、体育游戏库、课堂打卡记录、家校话术库，备课上课一站式', tag: '4大工具', color: '#FFA726', bg: '#FFF3E0' },
        { id: 'safety', icon: '🛡️', title: '课堂安全与应急预案', desc: '运动损伤处理流程、突发事件应急方案、安全检查清单', tag: '安全第一', color: '#EF5350', bg: '#FFEBEE' },
    ];
    
    const featureCards = [
        { id: 'games', icon: '🎮', title: '趣味课堂游戏库', desc: '丰富的体育课堂游戏，按类型分类，含组织方式和安全提示', tag: '课堂活跃', color: '#26A69A', bg: '#E0F2F1' },
        { id: 'safety_edu', icon: '📖', title: '运动安全科普素材', desc: '运动安全知识科普内容，可课堂展示或发给学生学习', tag: '安全教育', color: '#5C6BC0', bg: '#E8EAF6' },
        { id: 'gallery', icon: '📸', title: '学生运动风采素材生成', desc: '生成运动风采展示文案、表彰语、运动格言等素材', tag: '风采展示', color: '#EC407A', bg: '#FCE4EC' },
    ];
    
    const renderCard = (card) => `
        <div class="home-card" style="--card-color: ${card.color}; --card-bg: ${card.bg}" onclick="openCardDetail('${card.id}')">
            <span class="card-icon">${card.icon}</span>
            <div class="card-title">${card.title}</div>
            <div class="card-desc">${card.desc}</div>
            <span class="card-tag">${card.tag}</span>
        </div>
    `;
    
    document.getElementById('routineCards').innerHTML = routineCards.map(renderCard).join('');
    document.getElementById('featureCards').innerHTML = featureCards.map(renderCard).join('');
}

function openCardDetail(id) {
    const navMap = { roster: 'roster', analysis: 'analysis', scoreentry: 'scoreentry', toolbox: 'toolbox', safety: 'safety' };
    if (navMap[id]) {
        document.querySelector(`.nav-item[data-page="${navMap[id]}"]`).click();
        if (id === 'toolbox') switchToolboxTab('generator');
        return;
    }

    if (id === 'games') { document.querySelector('.nav-item[data-page="toolbox"]').click(); switchToolboxTab('games'); return; }
    if (id === 'tracking') openTrackingModal();
    if (id === 'safety_edu') openSafetyEduModal();
    if (id === 'gallery') openGalleryModal();
}

// ===== Roster =====
function initRoster() {
    // Class tabs
    const tabs = document.getElementById('classTabs');
    tabs.innerHTML = Object.keys(appData.students).map(cls => 
        `<div class="class-tab ${cls === appData.currentClass ? 'active' : ''}" data-class="${cls}">${cls}</div>`
    ).join('');
    
    tabs.addEventListener('click', e => {
        if (e.target.classList.contains('class-tab')) {
            appData.currentClass = e.target.dataset.class;
            tabs.querySelectorAll('.class-tab').forEach(t => t.classList.remove('active'));
            e.target.classList.add('active');
            renderRoster();
        }
    });
    
    document.getElementById('rosterGenderFilter').addEventListener('change', renderRoster);
    document.getElementById('rosterLevelFilter').addEventListener('change', renderRoster);
    document.getElementById('rosterSearch').addEventListener('input', renderRoster);
}

function renderRoster() {
    const cls = appData.currentClass;
    if (!cls) return;
    
    const students = appData.students[cls] || [];
    const genderFilter = document.getElementById('rosterGenderFilter').value;
    const levelFilter = document.getElementById('rosterLevelFilter').value;
    const search = document.getElementById('rosterSearch').value.trim().toLowerCase();
    
    let filtered = students.filter(s => {
        if (genderFilter && s.gender !== genderFilter) return false;
        if (levelFilter && getOverallLevel(s) !== levelFilter) return false;
        if (search) {
            const nameMatch = s.name.toLowerCase().includes(search);
            let pinyinMatch = false;
            if (/^[a-z]+$/.test(search) && typeof pinyinPro !== 'undefined') {
                const py = pinyinPro.pinyin(s.name, { toneType: 'none', type: 'array' });
                const initials = py.map(p => p.charAt(0).toLowerCase()).join('');
                pinyinMatch = initials.includes(search);
            }
            if (!nameMatch && !pinyinMatch) return false;
        }
        return true;
    });
    
    // Summary
    const maleCount = filtered.filter(s => s.gender === '男').length;
    const femaleCount = filtered.filter(s => s.gender === '女').length;
    const excellent = filtered.filter(s => getOverallLevel(s) === 'excellent').length;
    const weak = filtered.filter(s => getOverallLevel(s) === 'weak').length;
    const excused = filtered.filter(s => s.excused).length;
    const grade = gradeOfClass(cls);
    const showX8 = grade != null && grade >= 5;
    
    document.getElementById('rosterSummary').innerHTML = `
        <div class="summary-item"><div class="sum-val">${filtered.length}</div><div class="sum-label">总人数</div></div>
        <div class="summary-item"><div class="sum-val" style="color:#42A5F5">${maleCount}</div><div class="sum-label">男生</div></div>
        <div class="summary-item"><div class="sum-val" style="color:#EC407A">${femaleCount}</div><div class="sum-label">女生</div></div>
        <div class="summary-item"><div class="sum-val" style="color:#4CAF50">${excellent}</div><div class="sum-label">体能优秀</div></div>
        <div class="summary-item"><div class="sum-val" style="color:#f44336">${weak}</div><div class="sum-label">体能薄弱</div></div>
        ${excused ? `<div class="summary-item"><div class="sum-val" style="color:#8E24AA">${excused}</div><div class="sum-label">免测</div></div>` : ''}
    `;
    
    // Table
    const table = document.getElementById('rosterTable');
    table.innerHTML = `
        <thead>
            <tr>
                <th>序号</th><th>姓名</th><th>性别</th><th>身高(cm)</th><th>体重(kg)</th><th>肺活量(ml)</th>
                <th>50米跑(秒)</th><th>跳绳(次)</th><th>体前屈(cm)</th><th>仰卧起坐(次)</th>
                ${showX8 ? '<th>50×8(秒)</th>' : ''}
                <th>总分/等级</th>
            </tr>
        </thead>
        <tbody>
            ${filtered.map(s => {
                const level = getOverallLevel(s);
                const ov = getOverallScore(s);
                const ovTxt = s.excused ? '免测' : (ov.total != null ? `${ov.total}<span style="font-size:11px;"> · ${LEVEL_LABELS[ov.level]}</span>` : '—');
                const x8 = (s.run50x8 != null && s.run50x8 !== '') ? s.run50x8 : '-';
                return `<tr>
                    <td data-label="序号">${s.no || ''}</td>
                    <td class="name-cell" data-label="姓名" onclick="showStudentDetail('${cls}', ${s.no})">${s.name}</td>
                    <td data-label="性别"><span class="badge ${s.gender === '男' ? 'badge-male' : 'badge-female'}">${s.gender}</span></td>
                    <td data-label="身高">${s.height ?? '-'} cm</td>
                    <td data-label="体重">${s.weight ?? '-'} kg</td>
                    <td data-label="肺活量">${s.lung ?? '-'}</td>
                    <td data-label="50米跑">${s.run50 ?? '-'} 秒</td>
                    <td data-label="跳绳">${s.skipRope ?? '-'} 次</td>
                    <td data-label="体前屈">${s.sitReach ?? '-'} cm</td>
                    <td data-label="仰卧起坐">${s.sitUps ?? '-'} 次</td>
                    ${showX8 ? `<td data-label="50×8">${x8}</td>` : ''}
                    <td data-label="总分/等级"><span class="badge badge-${level}">${ovTxt}</span></td>
                </tr>`;
            }).join('')}
        </tbody>
    `;
}

function showStudentDetail(cls, no) {
    const student = appData.students[cls]?.find(s => s.no == no);
    if (!student) return;
    
    document.getElementById('modalStudentName').textContent = `${student.name} - ${cls}`;
    
    const items = getActiveItems(student.grade);
    const bmi = (student.height && student.weight) 
        ? (student.weight / Math.pow(student.height / 100, 2)).toFixed(1) : '-';
    
    const body = `
        <div class="student-info-grid">
            <div class="info-item">
                <div class="info-label">性别</div>
                <div class="info-value">${student.gender}</div>
            </div>
            <div class="info-item">
                <div class="info-label">身高</div>
                <div class="info-value">${student.height ?? '-'} <span class="stat-unit">cm</span></div>
            </div>
            <div class="info-item">
                <div class="info-label">体重</div>
                <div class="info-value">${student.weight ?? '-'} <span class="stat-unit">kg</span></div>
            </div>
            <div class="info-item">
                <div class="info-label">BMI</div>
                <div class="info-value">${bmi}</div>
            </div>
        </div>
        
        <div class="detail-section">
            <h4>体测成绩详情</h4>
            ${items.map(item => {
                const level = getScoreLevel(item, student[item], student.gender, student.grade);
                const score100 = getScore100(item, student[item], student.gender, student.grade);
                const lowerIsBetter = TEST_ITEMS[item]?.lowerIsBetter;
                const val = student[item];
                const pct = (score100 != null) ? Math.max(2, Math.min(100, score100)) : 0;
                const thr = getStdThresholds(item, student.grade, student.gender);
                const stdText = thr ? `标准：满分 ${lowerIsBetter ? '≤' : '≥'}${thr.满分} | 优秀 ${lowerIsBetter ? '≤' : '≥'}${thr.优秀} | 良好 ${lowerIsBetter ? '≤' : '≥'}${thr.良好} | 及格 ${lowerIsBetter ? '≤' : '≥'}${thr.及格}` : '';

                return `
                    <div class="score-bar">
                        <div class="score-bar-header">
                            <span class="score-bar-label">${TEST_ITEMS[item].icon} ${TEST_ITEMS[item].name}</span>
                            <span class="score-bar-value">${val ?? '未测'} ${TEST_ITEMS[item].unit} <span class="badge badge-${level}" style="margin-left:8px">${score100 != null ? score100 + ' 分' : LEVEL_LABELS[level]}</span></span>
                        </div>
                        <div class="score-bar-track">
                            <div class="score-bar-fill" style="width:${pct}%; background:${LEVEL_COLORS[level]}"></div>
                        </div>
                        ${stdText ? `<div style="font-size:11px;color:var(--gray-400);margin-top:4px;">${stdText}</div>` : ''}
                    </div>
                `;
            }).join('')}
        </div>
        
        <div class="detail-section">
            <h4>体能短板分析</h4>
            <div class="detail-content">${getWeaknessAnalysis(student)}</div>
        </div>
        
        ${renderBestRecords(student)}
        ${(student.history && student.history.length > 0) ? renderHistoryTrend(student) : ''}
        ${studentDetailScoreBlock(cls, student)}
        ${studentDetailActions(cls, student)}
    `;
    
    document.getElementById('modalStudentBody').innerHTML = body;
    openModal('studentModal');
}

function getWeaknessAnalysis(student) {
    const items = getActiveItems(student.grade);
    const weaknesses = items.filter(i => getScoreLevel(i, student[i], student.gender, student.grade) === 'weak');
    const strengths = items.filter(i => getScoreLevel(i, student[i], student.gender, student.grade) === 'excellent');
    
    let text = '';
    if (weaknesses.length === 0) {
        text += '✅ 该学生各项体测成绩均达到及格以上标准，体能发展均衡。\n';
    } else {
        text += `⚠️ 薄弱项目：${weaknesses.map(i => TEST_ITEMS[i].name).join('、')}\n`;
        text += `建议针对性加强${weaknesses.map(i => TEST_ITEMS[i].name).join('、')}的专项训练。\n`;
    }
    if (strengths.length > 0) {
        text += `\n💪 优势项目：${strengths.map(i => TEST_ITEMS[i].name).join('、')}\n`;
        text += '可鼓励学生在优势项目上继续提升，树立运动信心。';
    }
    return text;
}

// ===== History Archive (shared) =====
function archiveCurrentScores(student) {
    const items = getActiveItems(student.grade);
    // Check if student has any existing scores worth archiving
    const hasAnyScore = items.some(i => (i === 'bmi' ? (student.height != null && student.weight != null) : student[i] != null));
    if (!hasAnyScore) return;
    
    if (!student.history) student.history = [];
    
    const now = new Date();
    const dateStr = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
    
    const currentScores = { date: dateStr };
    items.forEach(i => { currentScores[i] = (i === 'bmi' ? calcBmi(student) : student[i]) ?? null; });
    
    // If last entry is from today with same scores, skip duplicate
    const last = student.history[student.history.length - 1];
    const same = last && last.date === dateStr && items.every(i => last[i] === currentScores[i]);
    if (same) {
        return;
    }
    
    student.history.push(currentScores);
    
    // Limit to 50 entries
    if (student.history.length > 50) {
        student.history = student.history.slice(-50);
    }
}

// ===== History Best Records =====
function renderBestRecords(student) {
    const items = getActiveItems(student.grade);
    const history = student.history || [];
    
    // Collect all records
    const curRec = { date: '当前' };
    items.forEach(it => { curRec[it] = (it === 'bmi' ? calcBmi(student) : student[it]) ?? null; });
    const allRecs = [...history, curRec];
    
    let html = '<div class="detail-section"><h4>🏆 历史最佳成绩</h4><div style="display:flex;flex-wrap:wrap;gap:10px;">';
    
    items.forEach(item => {
        const info = TEST_ITEMS[item];
        const lowerIsBetter = info?.lowerIsBetter;
        
        let bestVal = null, bestDate = '';
        allRecs.forEach(rec => {
            const val = rec[item];
            if (val == null) return;
            if (bestVal === null) { bestVal = val; bestDate = rec.date; return; }
            if (lowerIsBetter ? val < bestVal : val > bestVal) { bestVal = val; bestDate = rec.date; }
        });
        
        if (bestVal !== null) {
            const level = getScoreLevel(item, bestVal, student.gender, student.grade);
            html += `<div style="flex:1;min-width:120px;background:#FFF8E1;padding:8px 12px;border-radius:8px;border:1px solid #FFC107;text-align:center;">
                <div style="font-size:11px;color:var(--gray-500);">${info.icon} ${info.name}</div>
                <div style="font-size:18px;font-weight:700;color:#F57F17;">${bestVal}<span style="font-size:11px;color:var(--gray-500);">${info.unit}</span></div>
                <span class="badge badge-${level}" style="font-size:10px;">${LEVEL_LABELS[level]}</span>
                <div style="font-size:10px;color:var(--gray-400);">${bestDate}</div>
            </div>`;
        }
    });
    
    html += '</div></div>';
    return html;
}

// ===== History Trend =====
function renderHistoryTrend(student) {
    const items = getActiveItems(student.grade);
    const history = student.history || [];
    
    // Build all records (history + current)
    const allRecords = [...history];
    const now = new Date();
    const dateStr = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
    const curRec = { date: dateStr };
    items.forEach(it => { curRec[it] = (it === 'bmi' ? calcBmi(student) : student[it]) ?? null; });
    allRecords.push(curRec);
    
    if (allRecords.length < 2) return '';
    
    // Calculate changes between consecutive records
    const getChangeIcon = (item, oldVal, newVal, lowerIsBetter) => {
        if (oldVal === null || oldVal === undefined || newVal === null || newVal === undefined) return '';
        if (oldVal === newVal) return '<span style="color:#9E9E9E;">→</span>';
        const improved = lowerIsBetter ? newVal < oldVal : newVal > oldVal;
        return improved 
            ? '<span style="color:#4CAF50;font-weight:700;">↑' + Math.abs(newVal - oldVal).toFixed(1) + '</span>'
            : '<span style="color:#f44336;font-weight:700;">↓' + Math.abs(newVal - oldVal).toFixed(1) + '</span>';
    };
    
    let html = `
        <div class="detail-section">
            <h4>📈 成绩趋势对比（共${allRecords.length}次记录）</h4>
            <div style="overflow-x:auto;">
                <table class="history-table">
                    <thead>
                        <tr>
                            <th style="white-space:nowrap;">日期</th>
                            ${items.map(i => `<th style="text-align:center;">${TEST_ITEMS[i].icon}<br>${TEST_ITEMS[i].name}</th>`).join('')}
                        </tr>
                    </thead>
                    <tbody>
    `;
    
    allRecords.forEach((rec, idx) => {
        const isLatest = idx === allRecords.length - 1;
        const prev = idx > 0 ? allRecords[idx - 1] : null;
        
        html += `<tr style="${isLatest ? 'background:#E3F2FD;font-weight:600;' : ''}">`;
        html += `<td style="white-space:nowrap;">${rec.date}${isLatest ? '<br><span style="font-size:10px;color:#2196F3;">最新</span>' : ''}</td>`;
        
        items.forEach(item => {
            const val = rec[item];
            const lowerIsBetter = TEST_ITEMS[item]?.lowerIsBetter;
            const changeIcon = prev ? getChangeIcon(item, prev[item], val, lowerIsBetter) : '';
            const level = getScoreLevel(item, val, student.gender, student.grade);
            
            html += `<td style="text-align:center;">`;
            if (val !== null && val !== undefined) {
                html += `${val}<span style="font-size:11px;color:var(--gray-400);"> ${TEST_ITEMS[item].unit}</span>`;
                html += `<br><span class="badge badge-${level}" style="font-size:10px;">${LEVEL_LABELS[level]}</span>`;
            } else {
                html += '<span style="color:var(--gray-400);">—</span>';
            }
            if (changeIcon) {
                html += `<br><span style="font-size:11px;">${changeIcon}</span>`;
            }
            html += `</td>`;
        });
        
        html += `</tr>`;
    });
    
    html += `
                    </tbody>
                </table>
            </div>
    `;
    
    // Overall progress summary
    if (allRecords.length >= 2) {
        const first = allRecords[0];
        const last = allRecords[allRecords.length - 1];
        const improvements = [];
        const declines = [];
        
        items.forEach(item => {
            const firstVal = first[item];
            const lastVal = last[item];
            if (firstVal !== null && firstVal !== undefined && lastVal !== null && lastVal !== undefined && firstVal !== lastVal) {
                const lowerIsBetter = TEST_ITEMS[item]?.lowerIsBetter;
                const improved = lowerIsBetter ? lastVal < firstVal : lastVal > firstVal;
                const diff = Math.abs(lastVal - firstVal).toFixed(1);
                if (improved) {
                    improvements.push(`${TEST_ITEMS[item].name}(+${diff})`);
                } else {
                    declines.push(`${TEST_ITEMS[item].name}(-${diff})`);
                }
            }
        });
        
        html += '<div style="margin-top:12px;padding:10px;background:#F5F5F5;border-radius:8px;font-size:13px;">';
        if (improvements.length > 0) {
            html += `<div style="color:#2E7D32;">✅ 进步项目：${improvements.join('、')}</div>`;
        }
        if (declines.length > 0) {
            html += `<div style="color:#C62828;">⚠️ 退步项目：${declines.join('、')}</div>`;
        }
        if (improvements.length === 0 && declines.length === 0) {
            html += '<div style="color:var(--gray-500);">成绩无明显变化</div>';
        }
        html += '</div>';
    }
    
    html += '</div>';
    return html;
}

// ===== 学生详情：国标总分块 + 操作区 =====
// 免测开关：切换后刷新花名册/概览/当前视图并持久化
function setExcused(cls, no, val) {
    const s = appData.students[cls] && appData.students[cls].find(x => x.no == no);
    if (!s) return;
    s.excused = !!val;
    saveAppData();
    renderRoster();
    renderOverview();
    const modal = document.getElementById('studentModal');
    if (modal && modal.classList.contains('show')) {
        showStudentDetail(cls, no);
    } else {
        const sel = document.getElementById('studentSelect');
        if (sel && String(sel.value) == String(no)) renderStudentDetail(no);
        else showStudentDetail(cls, no);
    }
    showToast(s.excused ? '已标记为免测（不计入及格率）' : '已取消免测', 'success');
}

// 国标加权总分 / 等级展示块
function studentDetailScoreBlock(cls, student) {
    if (student.excused) {
        return `<div class="detail-section"><h4>国标总分与等级</h4>
            <div style="padding:14px;background:#F3E5F5;border-radius:10px;text-align:center;">
                <span class="badge badge-excused" style="font-size:14px;">免测 · 不参与评定</span>
                <div style="font-size:12px;color:#6A1B9A;margin-top:8px;">该生已标记免测，按政策不计入总分评定与班级及格率统计。</div>
            </div></div>`;
    }
    const ov = getOverallScore(student);
    let html = '<div class="detail-section"><h4>国标总分与等级（加权）</h4>';
    if (ov.total == null) {
        html += '<div style="padding:12px;background:#F5F5F5;border-radius:8px;color:var(--gray-500);font-size:13px;">尚无足够体测数据计算总分，请先在「成绩录入」补充身高体重与项目成绩。</div>';
    } else {
        const missingNames = ov.missing.map(i => (TEST_ITEMS[i] && TEST_ITEMS[i].name) || i).join('、');
        const note = ov.complete ? '' :
            `<div style="font-size:12px;color:#F57F17;margin-top:6px;">⚠️ 预估总分：尚有 ${missingNames} 未测，已按已测项权重归一化估算，补测后自动更新。</div>`;
        html += `<div style="display:flex;align-items:center;gap:16px;padding:14px;background:#E8F5E9;border-radius:10px;">
            <div style="font-size:36px;font-weight:800;color:${LEVEL_COLORS[ov.level]};line-height:1;">${ov.total}</div>
            <div>
                <span class="badge badge-${ov.level}" style="font-size:15px;">${LEVEL_LABELS[ov.level]}</span>
                <div style="font-size:12px;color:var(--gray-500);margin-top:4px;">评分标准：≥90 优秀 · 80–89.9 良好 · 60–79.9 及格 · &lt;60 不及格</div>
                ${note}
            </div>
        </div>`;
    }
    html += '</div>';
    return html;
}

// 详情页操作区：免测开关 / 运动处方 / 体质报告
function studentDetailActions(cls, student) {
    const exTxt = student.excused ? '↩️ 取消免测' : '🛡️ 设为免测';
    const exVal = student.excused ? 'false' : 'true';
    return `<div class="detail-section"><h4>操作</h4>
        <div style="display:flex;flex-wrap:wrap;gap:10px;">
            <button class="btn ${student.excused ? 'btn-cancel' : 'btn-warning'}" onclick="setExcused('${cls}', ${student.no}, ${exVal})">${exTxt}</button>
            <button class="btn btn-primary" onclick="generateExercisePrescription('${cls}', ${student.no})">💊 生成运动处方</button>
            <button class="btn btn-secondary" onclick="renderStudentReport('${cls}', ${student.no})">🖨️ 生成体质报告</button>
        </div></div>`;
}

// ===== 运动处方（联动真实薄弱项）=====
const EXERCISE_LIB = {
    run50: { name: '50米跑', focus: '速度 / 爆发力', plan: ['高抬腿 4×20秒（强调摆臂与提膝）', '30米冲刺跑 4组（组间走回放松）', '小步跑 + 后蹬跑 各 3×15米', '立卧撑 3×10次增强全身协调'], tip: '训练前充分热身，避免拉伤；每周3次，穿插在跳绳日之间。' },
    lung: { name: '肺活量', focus: '心肺耐量', plan: ['腹式深呼吸 4×10次（慢吸慢呼）', '吹气球 / 吹纸练习 3×15次', '12分钟持续慢跑（心率维持在120-140）', '游泳或骑车等有氧 2次/周'], tip: '配合慢跑提升有氧基础，肺活量提升见效较慢需坚持4周以上。' },
    sitReach: { name: '坐位体前屈', focus: '柔韧度', plan: ['坐姿体前屈静态保持 4×20秒（不弹震）', '站立体前屈 3×15秒', '瑜伽下犬式 / 猫式 各 1分钟', '腿部动态拉伸 2组'], tip: '每天早晚各一次，循序渐进，切忌用力过猛。' },
    skipRope: { name: '一分钟跳绳', focus: '协调 / 节奏', plan: ['空手摇绳 + 节奏练习 3×30秒', '1分钟计时跳 3组（记录次数）', '双脚交替单脚跳 各 2×30秒', '单摇提速 4×15秒'], tip: '重点练绳感与节奏，每次跳后休息同等时长。' },
    sitUps: { name: '一分钟仰卧起坐', focus: '腰腹力量', plan: ['卷腹 3×20次（控速）', '仰卧起坐 3×30秒计时', '平板支撑 3×30秒', '仰卧举腿 3×15次'], tip: '收紧腹部而非用脖子发力，避免颈椎受压。' },
    run50x8: { name: '50×8折返跑', focus: '灵敏 / 耐力', plan: ['变向折返灵敏梯 4×1分钟', '400米匀速跑 2组（控制节奏）', '30秒高强度 + 30秒慢走 间歇跑 6组', '标志物急停急起 3×10次'], tip: '注意转身降速与蹬地转身技术，防止踩线犯规。' },
    bmi: { name: '身高体重(BMI)', focus: '体态管理', plan: ['每日60分钟中高强度运动（跑跳类为主）', '减少油炸 / 含糖饮料，增加蔬菜蛋白质', '保证睡眠 9-10小时 / 天', '与家长共制每周运动打卡表'], tip: 'BMI 偏高/偏低需结合饮食与运动综合干预，建议家校协同。' },
};

function generateExercisePrescription(cls, no) {
    const student = (appData.students[cls] || []).find(s => s.no == no);
    if (!student) { showToast('未找到该学生', 'error'); return; }
    const items = getActiveItems(student.grade);
    const ranked = items.filter(i => {
        const v = i === 'bmi' ? calcBmi(student) : student[i];
        return v != null && v !== '' && !isNaN(parseFloat(v));
    }).map(i => {
        const raw = i === 'bmi' ? calcBmi(student) : student[i];
        return { item: i, sc: getScore100(i, parseFloat(raw), student.gender, student.grade) };
    }).filter(x => x.sc != null).sort((a, b) => a.sc - b.sc);

    const weak = ranked.filter(x => x.sc < 60);
    const belowGood = ranked.filter(x => x.sc < 80);
    const targets = (belowGood.length ? belowGood : ranked).slice(0, 2);

    let body = '';
    const ov = getOverallScore(student);
    if (student.excused) {
        body = `<div style="padding:16px;background:#F3E5F5;border-radius:10px;color:#6A1B9A;">该生已标记免测，暂不生成运动处方。如有康复性锻炼需求，请遵医嘱单独安排。</div>`;
    } else if (targets.length === 0) {
        body = `<div style="padding:16px;background:#E8F5E9;border-radius:10px;color:#2E7D32;">🎉 该生各项目均达良好及以上，继续保持规律运动即可，无需专项强化处方。</div>`;
    } else {
        const title = weak.length
            ? `薄弱项目专项强化（共 ${weak.length} 项不及格，优先 ${targets.map(t => EXERCISE_LIB[t.item].name).join('、')}）`
            : `提升项目家庭锻炼计划（针对 ${targets.map(t => EXERCISE_LIB[t.item].name).join('、')}）`;
        body += `<div style="padding:10px 14px;background:#FFF3E0;border-radius:8px;font-weight:600;color:#E65100;margin-bottom:12px;">${title}</div>`;
        targets.forEach(t => {
            const lib = EXERCISE_LIB[t.item];
            body += `<div style="margin-bottom:14px;padding:12px;border:1px solid #FFCCBC;border-radius:10px;background:#FFF;">
                <div style="font-weight:700;margin-bottom:6px;">💊 ${lib.name} <span style="font-weight:400;font-size:12px;color:var(--gray-500);">（训练重点：${lib.focus} · 当前单项 ${t.sc} 分）</span></div>
                <ol style="margin:0;padding-left:20px;font-size:13px;line-height:1.8;">${lib.plan.map(p => `<li>${p}</li>`).join('')}</ol>
                <div style="font-size:12px;color:#EF6C00;margin-top:6px;">⏱ ${lib.tip}</div>
            </div>`;
        });
        body += `<div style="font-size:12px;color:var(--gray-500);">建议每周训练 3-4 次，每次 20-30 分钟；4 周后回测对比进步。本处方由系统依据国标单项得分自动生成，仅供参考，特殊情况请遵医嘱。</div>`;
    }

    document.getElementById('prescriptionTitle').textContent = `${student.name} 的运动处方`;
    document.getElementById('prescriptionBody').innerHTML = body;
    openModal('prescriptionModal');
}

// ===== 可打印个人体质报告 =====
function renderStudentReport(cls, no) {
    const student = (appData.students[cls] || []).find(s => s.no == no);
    if (!student) { showToast('未找到该学生', 'error'); return; }
    if (student.excused) {
        showToast('该生为免测，不生成评定报告', 'error');
        return;
    }
    const items = getActiveItems(student.grade);
    const ov = getOverallScore(student);
    const bmi = calcBmi(student);
    const now = new Date();
    const dateStr = now.getFullYear() + '年' + (now.getMonth() + 1) + '月' + now.getDate() + '日';

    let rows = items.map(item => {
        const v = item === 'bmi' ? bmi : student[item];
        const level = getScoreLevel(item, v, student.gender, student.grade);
        const sc = getScore100(item, v, student.gender, student.grade);
        const name = (TEST_ITEMS[item] && TEST_ITEMS[item].name) || item;
        const unit = (TEST_ITEMS[item] && TEST_ITEMS[item].unit) || '';
        const std = getStdThresholds(item, student.grade, student.gender);
        const stdTxt = std ? `满分${std.满分}｜优秀${std.优秀}｜良好${std.良好}｜及格${std.及格}` : '';
        return `<tr>
            <td>${name}</td>
            <td>${v != null && v !== '' ? v + ' ' + unit : '未测'}</td>
            <td>${sc != null ? sc : '—'}</td>
            <td><b style="color:${LEVEL_COLORS[level]}">${LEVEL_LABELS[level]}</b></td>
            <td style="font-size:11px;color:#666;">${stdTxt}</td>
        </tr>`;
    }).join('');

    const weak = items.filter(i => {
        const v = i === 'bmi' ? bmi : student[i];
        return getScoreLevel(i, v, student.gender, student.grade) === 'weak';
    });
    const weakTxt = weak.length ? weak.map(i => (TEST_ITEMS[i] && TEST_ITEMS[i].name) || i).join('、') : '无';

    const inner = `<div class="report-doc">
      <h1>学生体质健康报告</h1>
      <div class="meta">
        <span>姓名：${student.name}</span><span>性别：${student.gender}</span>
        <span>班级：${cls}</span><span>年级：${gradeOfClass(cls)} 年级</span>
        <span>身高：${student.height ?? '—'} cm</span><span>体重：${student.weight ?? '—'} kg</span>
        <span>BMI：${bmi ?? '—'}</span>
      </div>
      <div class="box" style="display:flex;align-items:center;gap:18px;">
        <div class="score-big">${ov.total != null ? ov.total : '—'}</div>
        <div>
          <div style="font-size:15px;">综合评级：<b style="color:${ov.total != null ? LEVEL_COLORS[ov.level] : '#999'}">${ov.total != null ? LEVEL_LABELS[ov.level] : '数据不足'}</b></div>
          <div style="font-size:12px;color:#666;">（依据《国家学生体质健康标准（2014修订）》加权总分评定${ov.complete ? '' : '，含未测项按已测项估算'}）</div>
        </div>
      </div>
      <table><thead><tr><th>测试项目</th><th>成绩</th><th>单项得分</th><th>等级</th><th>标准线</th></tr></thead>
      <tbody>${rows}</tbody></table>
      <div class="box"><b>薄弱项目：</b>${weakTxt}<br><b>综合建议：</b>${weak.length ? '针对薄弱项目加强家庭锻炼（详见运动处方），4周后复测。' : '各项达标，保持规律运动即可。'}</div>
      <div class="foot">生成日期：${dateStr} · 体育老师AI工作台 · 本报告由系统依据国标自动生成，仅供教学参考。</div>
    </div>`;

    document.getElementById('reportBody').innerHTML = inner;
    openModal('reportModal');
}

// ===== 国家体测网上报格式导出 =====
function exportUploadXlsx() {
    const cls = appData.currentClass;
    if (!cls) { showToast('请先选择班级', 'error'); return; }
    const grade = gradeOfClass(cls);
    const items = getActiveItems(grade);
    const students = appData.students[cls] || [];
    if (!students.length) { showToast('当前班级无学生数据', 'error'); return; }

    const header = ['年级', '班级', '姓名', '性别', '学号', '出生日期', '身高(cm)', '体重(kg)'];
    items.forEach(i => header.push((TEST_ITEMS[i] && TEST_ITEMS[i].name) + ((TEST_ITEMS[i] && TEST_ITEMS[i].unit) ? '(' + TEST_ITEMS[i].unit + ')' : '')));
    header.push('BMI', '总分', '等级', '免测');

    const note = ['（国家学生体质健康标准·数据上报模板）请在上报系统中补全学号 / 出生日期；总分与等级由系统按国标加权自动计算。'];
    const wsData = [note, header];

    students.forEach(s => {
        const ov = getOverallScore(s);
        const bmi = calcBmi(s);
        const row = [grade != null ? grade : '', cls, s.name, s.gender, s.no != null ? s.no : '', '', s.height != null ? s.height : '', s.weight != null ? s.weight : ''];
        items.forEach(i => row.push(i === 'bmi' ? (bmi != null ? bmi : '') : (s[i] != null ? s[i] : '')));
        row.push(bmi != null ? bmi : '');
        row.push(s.excused ? '' : (ov.total != null ? ov.total : ''));
        row.push(s.excused ? '免测' : (ov.total != null ? LEVEL_LABELS[ov.level] : ''));
        row.push(s.excused ? '是' : '否');
        wsData.push(row);
    });

    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws['!rows'] = [{ hpt: 30 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '上报数据');
    XLSX.writeFile(wb, `${cls}_上报数据_${new Date().toLocaleDateString()}.xlsx`);
    showToast('上报格式 Excel 已导出', 'success');
}

// ===== 数据备份与恢复 =====
function backupData() {
    const payload = {
        app: 'pe-workbench',
        version: 8,
        exportedAt: new Date().toISOString(),
        students: appData.students,
        currentClass: appData.currentClass,
        logs: appData.logs,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `体育工作台备份_${new Date().toLocaleDateString()}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
    showToast('备份已导出（JSON）', 'success');
}

function triggerRestore() {
    const i = document.getElementById('restoreFile');
    if (i) i.click();
}

function restoreData(input) {
    const file = input.files && input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
        try {
            const data = JSON.parse(e.target.result);
            if (!data.students) throw new Error('不是有效的工作台备份文件');
            if (!window.confirm('恢复备份将覆盖当前所有班级数据，确定继续？（建议先导出当前备份）')) { input.value = ''; return; }
            appData.students = data.students;
            appData.currentClass = data.currentClass || Object.keys(data.students)[0];
            appData.logs = data.logs || [];
            saveAppData();
            initRoster(); renderRoster(); renderOverview(); renderStudentMgmt();
            showToast('数据已从备份恢复', 'success');
        } catch (err) {
            showToast('备份文件无法解析：' + err.message, 'error');
        }
        input.value = '';
    };
    reader.readAsText(file);
}

// ===== Analysis =====
function initAnalysis() {
    const classSelect = document.getElementById('analysisClass');
    classSelect.innerHTML = Object.keys(appData.students).map(cls => 
        `<option value="${cls}" ${cls === appData.currentClass ? 'selected' : ''}>${cls}</option>`
    ).join('');
    
    classSelect.addEventListener('change', () => {
        appData.currentClass = classSelect.value;
        renderAnalysis();
    });
    
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById('atab-' + btn.dataset.atab).classList.add('active');
            if (btn.dataset.atab === 'project') renderProjectAnalysis();
            if (btn.dataset.atab === 'student') renderStudentAnalysis();
            if (btn.dataset.atab === 'warning') renderWarnings();
        });
    });
    
    // Project selector（按当前班级年级显示实际项目：含肺活量、5-6年级含50×8）
    const curGrade = gradeOfClass(appData.currentClass);
    const projects = getActiveItems(curGrade);
    document.getElementById('projectSelector').innerHTML = projects.map((p, i) => 
        `<div class="project-btn ${i === 0 ? 'active' : ''}" data-project="${p}">${TEST_ITEMS[p].icon} ${TEST_ITEMS[p].name}</div>`
    ).join('');
    
    document.getElementById('projectSelector').addEventListener('click', e => {
        if (e.target.classList.contains('project-btn')) {
            document.querySelectorAll('.project-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            renderProjectChart(e.target.dataset.project);
        }
    });
    
    // Student selector
    document.getElementById('studentSelect').addEventListener('change', e => {
        renderStudentDetail(e.target.value);
    });
}

function renderAnalysis() {
    renderOverview();
    renderProjectChart('run50');
    renderStudentAnalysis();
}

function renderOverview() {
    const cls = appData.currentClass;
    const students = appData.students[cls] || [];
    
    const total = students.length;
    const maleCount = students.filter(s => s.gender === '男').length;
    const femaleCount = total - maleCount;
    
    const avg = (arr) => {
        const valid = arr.filter(v => v !== null && v !== undefined && !isNaN(v));
        return valid.length > 0 ? (valid.reduce((a, b) => a + b, 0) / valid.length) : 0;
    };

    const avgRun50 = avg(students.map(s => s.run50));
    const avgSkip = avg(students.map(s => s.skipRope));
    const avgSitReach = avg(students.map(s => s.sitReach));
    const avgSitUps = avg(students.map(s => s.sitUps));

    // 班级加权总分统计（免测生不计入分母）
    const rated = students.filter(s => !s.excused);
    let sumTotal = 0, cnt = 0, pass = 0, good = 0;
    rated.forEach(s => {
        const r = getOverallScore(s);
        if (r.total != null) { sumTotal += r.total; cnt++; if (r.level !== 'weak' && r.level !== 'none') pass++; if (r.level === 'excellent' || r.level === 'good') good++; }
    });
    const avgTotal = cnt ? (sumTotal / cnt).toFixed(1) : '—';
    const passRate = rated.length ? Math.round(pass / rated.length * 100) : 0;
    const goodRate = rated.length ? Math.round(good / rated.length * 100) : 0;
    const excusedCount = students.length - rated.length;

    document.getElementById('overviewStats').innerHTML = `
        <div class="stat-card" style="--card-color:#1565C0"><div class="stat-label">总分均值</div><div class="stat-value">${avgTotal}<span class="stat-unit">分</span></div></div>
        <div class="stat-card" style="--card-color:#2E7D32"><div class="stat-label">及格率</div><div class="stat-value">${passRate}<span class="stat-unit">%</span></div></div>
        <div class="stat-card" style="--card-color:#F9A825"><div class="stat-label">优良率</div><div class="stat-value">${goodRate}<span class="stat-unit">%</span></div></div>
        <div class="stat-card" style="--card-color:#4CAF50"><div class="stat-label">班级总人数</div><div class="stat-value">${total}</div></div>
        <div class="stat-card" style="--card-color:#42A5F5"><div class="stat-label">男生</div><div class="stat-value">${maleCount}</div></div>
        <div class="stat-card" style="--card-color:#EC407A"><div class="stat-label">女生</div><div class="stat-value">${femaleCount}</div></div>
        ${excusedCount ? `<div class="stat-card" style="--card-color:#8E24AA"><div class="stat-label">免测人数</div><div class="stat-value">${excusedCount}</div></div>` : ''}
        <div class="stat-card" style="--card-color:#FFA726"><div class="stat-label">50米跑均值</div><div class="stat-value">${avgRun50.toFixed(2)}<span class="stat-unit">秒</span></div></div>
        <div class="stat-card" style="--card-color:#26A69A"><div class="stat-label">跳绳均值</div><div class="stat-value">${avgSkip.toFixed(0)}<span class="stat-unit">次</span></div></div>
        <div class="stat-card" style="--card-color:#AB47BC"><div class="stat-label">体前屈均值</div><div class="stat-value">${avgSitReach.toFixed(1)}<span class="stat-unit">cm</span></div></div>
        <div class="stat-card" style="--card-color:#EF5350"><div class="stat-label">仰卧起坐均值</div><div class="stat-value">${avgSitUps.toFixed(0)}<span class="stat-unit">次</span></div></div>
    `;
    
    renderDistributionChart('chartRun50', '50米跑成绩分布', students, 'run50', '#FFA726');
    renderDistributionChart('chartSkipRope', '跳绳成绩分布', students, 'skipRope', '#26A69A');
    renderDistributionChart('chartSitReach', '坐位体前屈分布', students, 'sitReach', '#AB47BC');
    renderDistributionChart('chartSitUps', '仰卧起坐分布', students, 'sitUps', '#EF5350');
}

function renderDistributionChart(canvasId, title, students, item, color) {
    const levels = { excellent: 0, good: 0, pass: 0, weak: 0, none: 0 };
    students.forEach(s => {
        const level = getScoreLevel(item, s[item], s.gender, s.grade);
        levels[level]++;
    });
    
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;
    
    if (appData.charts[canvasId]) appData.charts[canvasId].destroy();
    
    appData.charts[canvasId] = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['优秀', '良好', '及格', '薄弱', '未测'],
            datasets: [{
                data: [levels.excellent, levels.good, levels.pass, levels.weak, levels.none],
                backgroundColor: ['#4CAF50', '#2196F3', '#FF9800', '#f44336', '#E0E0E0'],
                borderWidth: 0,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: { display: true, text: title, font: { size: 14, weight: 'bold' }, color: '#424242', padding: { bottom: 10 } },
                legend: { position: 'right', labels: { font: { size: 11 }, padding: 8, boxWidth: 12 } }
            }
        }
    });
}

function renderProjectChart(project) {
    const cls = appData.currentClass;
    const students = appData.students[cls] || [];
    const maleData = students.filter(s => s.gender === '男').map(s => s[project]).filter(v => v !== null && v !== undefined && !isNaN(v));
    const femaleData = students.filter(s => s.gender === '女').map(s => s[project]).filter(v => v !== null && v !== undefined && !isNaN(v));
    
    const ctx = document.getElementById('chartProject');
    if (appData.charts.chartProject) appData.charts.chartProject.destroy();
    
    const lowerIsBetter = TEST_ITEMS[project]?.lowerIsBetter;
    const sortedMale = [...maleData].sort((a, b) => lowerIsBetter ? a - b : b - a);
    const sortedFemale = [...femaleData].sort((a, b) => lowerIsBetter ? a - b : b - a);
    
    appData.charts.chartProject = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: Array.from({length: Math.max(sortedMale.length, sortedFemale.length)}, (_, i) => `${i + 1}`),
            datasets: [
                { label: '男生', data: sortedMale, backgroundColor: '#42A5F5', borderRadius: 4 },
                { label: '女生', data: sortedFemale, backgroundColor: '#EC407A', borderRadius: 4 }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: { display: true, text: `${TEST_ITEMS[project].name}成绩排名（${TEST_ITEMS[project].unit}）`, font: { size: 14, weight: 'bold' } },
                legend: { position: 'top' }
            },
            scales: {
                y: { beginAtZero: !lowerIsBetter, title: { display: true, text: TEST_ITEMS[project].unit } }
            }
        }
    });
    
    // Project stats
    const allData = [...maleData, ...femaleData];
    const avg = allData.reduce((a, b) => a + b, 0) / allData.length;
    const max = lowerIsBetter ? Math.min(...allData) : Math.max(...allData);
    const min = lowerIsBetter ? Math.max(...allData) : Math.min(...allData);
    const bestName = lowerIsBetter ? '最快' : '最高';
    const worstName = lowerIsBetter ? '最慢' : '最低';
    
    document.getElementById('projectStats').innerHTML = `
        <div class="stat-card" style="--card-color:#4CAF50"><div class="stat-label">平均成绩</div><div class="stat-value">${avg.toFixed(1)}<span class="stat-unit">${TEST_ITEMS[project].unit}</span></div></div>
        <div class="stat-card" style="--card-color:#42A5F5"><div class="stat-label">${bestName}成绩</div><div class="stat-value">${max}<span class="stat-unit">${TEST_ITEMS[project].unit}</span></div></div>
        <div class="stat-card" style="--card-color:#f44336"><div class="stat-label">${worstName}成绩</div><div class="stat-value">${min}<span class="stat-unit">${TEST_ITEMS[project].unit}</span></div></div>
        <div class="stat-card" style="--card-color:#FFA726"><div class="stat-label">参测人数</div><div class="stat-value">${allData.length}</div></div>
    `;
}

function renderStudentAnalysis() {
    const cls = appData.currentClass;
    const students = appData.students[cls] || [];
    
    document.getElementById('studentSelect').innerHTML = students.map(s => 
        `<option value="${s.no}">${s.no}. ${s.name}（${s.gender}）</option>`
    ).join('');
    
    if (students.length > 0) renderStudentDetail(students[0].no);
}

function renderStudentDetail(no) {
    const cls = appData.currentClass;
    const student = appData.students[cls]?.find(s => s.no == no);
    if (!student) return;
    
    const items = getActiveItems(student.grade);
    
    const body = `
        <div class="detail-section">
            <h4>基本信息</h4>
            <div class="student-info-grid">
                <div class="info-item"><div class="info-label">姓名</div><div class="info-value">${student.name}</div></div>
                <div class="info-item"><div class="info-label">性别</div><div class="info-value">${student.gender}</div></div>
                <div class="info-item"><div class="info-label">身高</div><div class="info-value">${student.height ?? '-'}<span class="stat-unit">cm</span></div></div>
                <div class="info-item"><div class="info-label">体重</div><div class="info-value">${student.weight ?? '-'}<span class="stat-unit">kg</span></div></div>
            </div>
        </div>
        <div class="detail-section">
            <h4>体测成绩与评级</h4>
            ${items.map(item => {
                const level = getScoreLevel(item, student[item], student.gender, student.grade);
                const val = student[item];
                return `<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--gray-100);">
                    <span style="font-weight:600;">${TEST_ITEMS[item].icon} ${TEST_ITEMS[item].name}</span>
                    <span>${val ?? '未测'} ${TEST_ITEMS[item].unit}</span>
                    <span class="badge badge-${level}">${LEVEL_LABELS[level]}</span>
                </div>`;
            }).join('')}
        </div>
        <div class="detail-section">
            <h4>体能分析</h4>
            <div class="detail-content">${getWeaknessAnalysis(student)}</div>
        </div>
        ${renderBestRecords(student)}
        ${(student.history && student.history.length > 0) ? renderHistoryTrend(student) : ''}
        ${studentDetailScoreBlock(cls, student)}
        ${studentDetailActions(cls, student)}
    `;
    
    document.getElementById('studentDetail').innerHTML = body;
}

function renderWarnings() {
    const cls = appData.currentClass;
    const students = appData.students[cls] || [];
    const items = getActiveItems(student.grade);
    
    const warnings = [];
    students.forEach(s => {
        const weakItems = items.filter(i => getScoreLevel(i, s[i], s.gender, s.grade) === 'weak');
        if (weakItems.length > 0) {
            warnings.push({ student: s, items: weakItems });
        }
    });
    
    if (warnings.length === 0) {
        document.getElementById('warningContent').innerHTML = '<div style="text-align:center;padding:40px;color:var(--gray-500);">🎉 当前班级暂无薄弱项目预警，所有学生均达标！</div>';
        return;
    }
    
    document.getElementById('warningContent').innerHTML = warnings.map(w => `
        <div class="warning-item" style="border-color:#f44336;">
            <div class="warning-student">${w.student.name}</div>
            <span class="badge ${w.student.gender === '男' ? 'badge-male' : 'badge-female'}">${w.student.gender}</span>
            <div class="warning-items">
                ${w.items.map(i => `<span class="warning-tag" style="background:#FFEBEE;color:#C62828;">${TEST_ITEMS[i].icon} ${TEST_ITEMS[i].name}</span>`).join('')}
            </div>
        </div>
    `).join('');
}

// ===== 教学工具箱 =====
let currentGameCat = '全部';
let currentPerf = '';
window._currentPlan = null;

function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}
function escapeHtml(s) { return esc(s); }

function fillSelect(id, arr) {
    const el = document.getElementById(id);
    if (el) el.innerHTML = arr.map(v => `<option value="${esc(v)}">${esc(v)}</option>`).join('');
}

// ===== Score Entry =====
const SE_PROJECTS = [
    { code: 'bmi',      name: '身高体重(BMI)',   icon: '⚖️',  unit: '',  inputType: 'bmi', step: '0.1', min: '0', max: '60' },
    { code: 'lung',     name: '肺活量',          icon: '🫁',  unit: 'ml', inputType: 'number', step: '1',   min: '0', max: '9999' },
    { code: 'run50',    name: '50米跑',          icon: '🏃',  unit: '秒', inputType: 'number', step: '0.01', min: '0', max: '60' },
    { code: 'sitReach', name: '坐位体前屈',      icon: '🤸',  unit: 'cm', inputType: 'number', step: '0.1', min: '-30', max: '50' },
    { code: 'skipRope', name: '一分钟跳绳',      icon: '🪢',  unit: '次', inputType: 'number', step: '1',   min: '0', max: '500' },
    { code: 'run50x8',  name: '50×8折返跑',      icon: '🏃‍♂️', unit: '秒', inputType: 'number', step: '0.1', min: '0', max: '600' },
    { code: 'sitUps',   name: '一分钟仰卧起坐',  icon: '💪',  unit: '次', inputType: 'number', step: '1',   min: '0', max: '200' },
];
const SE_LEVEL_TEXT = { excellent: '优秀', good: '良好', pass: '及格', weak: '未达标', none: '' };

let seState = { step: 1, klass: null, groupSize: 4, project: 'run50', leaveMap: {}, groupMode: 'default' };

function parseClassName(klass) {
    // 优先识别「小学/初中 + 入学年届 + 级」命名，如 小学2024级1班（2024年入学，2026-09 为 3 年级）
    const cm = String(klass).match(/(小学|初中)(\d{4})级(\d+)班?/);
    if (cm) {
        const entry = cm[1] === '小学' ? 1 : 7;
        const g = entry + (REF_SCHOOL_YEAR - parseInt(cm[2], 10));
        return { grade: (g >= 1 && g <= 9) ? g : null, num: parseInt(cm[3], 10), display: cm[0] };
    }
    const cnMap = { '一':1,'二':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9 };
    let m = klass.match(/^([一二三四五六七八九])(\d+)班?$/);
    if (m) return { grade: cnMap[m[1]], num: parseInt(m[2]), display: m[1] + m[2] };
    m = klass.match(/^(\d)0(\d+)班?$/);  // 形如 404 = 4年级4班（中间0为分隔符）
    if (m) return { grade: parseInt(m[1]), num: parseInt(m[2]), display: m[1] + '0' + m[2] };
    m = klass.match(/^(\d{1,2})(\d+)班?$/);
    if (m) return { grade: parseInt(m[1]), num: parseInt(m[2]), display: m[1] + m[2] };
    m = klass.match(/^(\d{1,2})班?$/);
    if (m) return { grade: parseInt(m[1]), num: null, display: m[1] };
    return { grade: null, num: null, display: klass.replace('班','') };
}

// 国家体测网「年级编号」→ 实际年级：11小一…16小六，21初一…23初三
const GN_MAP = { 11:1, 12:2, 13:3, 14:4, 15:5, 16:6, 21:7, 22:8, 23:9 };
// 取班级的年级：优先用该班首名学生的 grade（导入时已写入），否则回退按班级名解析
function gradeOfClass(klass) {
    const list = appData.students[klass];
    if (list && list.length && list[0].grade != null) return list[0].grade;
    return parseClassName(klass).grade;
}
function gradeFromNo(v) {
    if (v == null || v === '') return null;
    const n = parseFloat(v);
    if (isNaN(n)) return null;
    return GN_MAP[n] != null ? GN_MAP[n] : null;
}
// 由班级名中的「入学年届」推算当前年级（小学1年级入学、初中7年级入学）。
// 返回 null = 无法识别；返回 > 9 = 已升高中（不录入）。
function cohortYearFromClass(cls) {
    const m = String(cls).match(/(小学|初中)(\d{4})级/);
    if (!m) return null;
    return { type: m[1], year: parseInt(m[2], 10) };
}
function currentGradeFromClass(cls) {
    const c = cohortYearFromClass(cls);
    if (!c) return null;
    const entry = c.type === '小学' ? 1 : 7;
    return entry + (REF_SCHOOL_YEAR - c.year);
}
function mapGender(v) {
    if (v == null) return '';
    const s = String(v).trim().replace('.0', '');
    if (s === '1' || s === '男') return '男';
    if (s === '2' || s === '女') return '女';
    return s;
}
// Excel 序列日期（1900 系统）→ YYYY-MM-DD
function excelDateToStr(v) {
    if (v == null || v === '') return '';
    const n = parseFloat(v);
    if (isNaN(n)) return String(v);
    const d = new Date((n - 25569) * 86400 * 1000);
    if (isNaN(d.getTime())) return String(v);
    const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function initScoreEntry() {
    renderSeTestGrid();
}

function renderScoreEntry() {
    populateSeGradeClass();
    seGoStep(1);
}

function populateSeGradeClass() {
    const groups = {};
    Object.keys(appData.students).forEach(k => {
        const p = parseClassName(k);
        const g = gradeOfClass(k);
        groups[g] = groups[g] || [];
        groups[g].push({ name: k, num: p.num, display: p.display });
    });
    const sortedGrades = Object.keys(groups).map(Number).sort((a, b) => a - b);
    window._seGroups = groups;
    const gradeSel = document.getElementById('seGrade');
    gradeSel.innerHTML = '<option value="">请选择年级</option>' + sortedGrades.map(g =>
        `<option value="${g}">${g === 0 ? '其他' : g + '年级'}</option>`).join('');
    onSeGradeChange();
}

function onSeGradeChange() {
    const g = document.getElementById('seGrade').value;
    const groups = window._seGroups || {};
    const list = (groups[g] || []).slice().sort((a, b) => (a.num || 0) - (b.num || 0));
    const classSel = document.getElementById('seClass');
    classSel.innerHTML = list.length
        ? '<option value="">请选择班级</option>' + list.map(c => `<option value="${esc(c.name)}">${esc(c.display)}班</option>`).join('')
        : '<option value="">请先选年级</option>';
    document.getElementById('seClassMeta').innerHTML = '';
    seState.klass = null;
    updateSeNextBtn();
}

function onSeClassChange() {
    const klass = document.getElementById('seClass').value;
    seState.klass = klass;
    if (!klass) { document.getElementById('seClassMeta').innerHTML = ''; updateSeNextBtn(); return; }
    const list = appData.students[klass] || [];
    const boys = list.filter(s => s.gender === '男').length;
    const girls = list.filter(s => s.gender === '女').length;
    document.getElementById('seClassMeta').innerHTML = `
        <div class="se-class-stat">
            <span>👥 共 ${list.length} 人</span>
            <span>👦 ${boys}</span>
            <span>👧 ${girls}</span>
        </div>`;
    updateSeNextBtn();
}

function updateSeNextBtn() {
    const b = document.getElementById('seGotoStep2');
    if (b) b.disabled = !seState.klass;
}

function renderSeTestGrid() {
    const grid = document.getElementById('seTestGrid');
    if (!grid) return;
    grid.innerHTML = SE_PROJECTS.map(p => `
        <button type="button" class="se-test-btn" data-proj="${esc(p.code)}" onclick="seSelectProject('${esc(p.code)}')">
            <span class="se-test-icon">${p.icon}</span>
            <span class="se-test-name">${esc(p.name)}</span>
            <span class="se-test-status" data-status="proj-${esc(p.code)}">完成率: —</span>
        </button>`).join('');
    seUpdateProjectStatus();
}

function seUpdateProjectStatus() {
    const klass = document.getElementById('seClass')?.value || seState.klass;
    if (!klass) return;
    const list = appData.students[klass] || [];
    SE_PROJECTS.forEach(p => {
        const el = document.querySelector(`[data-status="proj-${p.code}"]`);
        if (!el) return;
        let done = 0;
        list.forEach(s => { if (s[p.code] != null && s[p.code] !== '') done++; });
        const pct = list.length ? Math.round(done / list.length * 100) : 0;
        el.textContent = `完成率: ${pct}%`;
    });
}

function seSelectProject(code) {
    seState.project = code;
    document.querySelectorAll('.se-test-btn').forEach(b => b.classList.toggle('active', b.dataset.proj === code));
    const proj = SE_PROJECTS.find(p => p.code === code);
    document.getElementById('seStep2Summary').innerHTML = `
        <div class="se-step2-info">
            <span>📋 ${esc(seState.klass || '')}</span>
            <span class="se-step2-proj">${proj.icon} ${esc(proj.name)}${proj.unit ? '（' + proj.unit + '）' : ''}</span>
        </div>`;
}

function seGoStep(step) {
    if (step !== 3) pauseRopeMusic();
    if (step === 3) resetStopwatch();
    if (step === 2 && !seState.klass) { step = 1; showToast('请先选择班级', ''); }
    seState.step = step;
    document.querySelectorAll('.se-step').forEach(s => {
        const n = parseInt(s.dataset.step);
        s.classList.toggle('active', n === step);
        s.classList.toggle('done', n < step);
    });
    document.querySelectorAll('.se-view').forEach(v => v.classList.remove('active'));
    document.getElementById('seView' + step).classList.add('active');
    if (step === 2) {
        const cur = seState.project || 'run50';
        seSelectProject(cur);
        seState.groupSize = parseInt(document.getElementById('seGroupSize').value) || 4;
        seUpdateProjectStatus();
    }
    if (step === 3) {
        seState.groupSize = parseInt(document.getElementById('seGroupSize').value) || 4;
        seState.leaveMap = {};
        renderSeEntryTable();
    }
    document.getElementById('mainContent').scrollTop = 0;
    updateSeToolbar();
}

function updateSeToolbar() {
    const bar = document.getElementById('seToolbar');
    if (!bar) return;
    bar.classList.toggle('visible', seState.step === 3);
}

// ===== 一分钟跳绳计时音乐 =====
function toggleRopeMusic() {
    const a = document.getElementById('ropeAudio');
    if (!a) return;
    if (a.paused) {
        a.currentTime = 0;
        a.play().then(() => updateRopeMusicUI(true)).catch(() => showToast('音乐播放失败，请检查音频文件', 'error'));
    } else {
        a.pause();
        updateRopeMusicUI(false);
    }
}
function updateRopeMusicUI(playing) {
    const icon = document.getElementById('ropeMusicIcon');
    const label = document.getElementById('ropeMusicLabel');
    const btn = document.getElementById('ropeMusicBtn');
    if (icon) icon.textContent = playing ? '⏸️' : '🎵';
    if (label) label.textContent = playing ? '停止计时音乐' : '一分钟计时音乐';
    if (btn) btn.classList.toggle('playing', playing);
}
function pauseRopeMusic() {
    const a = document.getElementById('ropeAudio');
    if (a && !a.paused) { a.pause(); a.currentTime = 0; }
    updateRopeMusicUI(false);
}

// ===== 录入界面：快速分组（性别 / 身高 / 性别+身高） =====
// 计算某分组内「已录入」人数
function seGroupProgress(students) {
    let done = 0;
    students.forEach(s => {
        if (seState.leaveMap[s.no]) return;
        const v = seState.project === 'bmi' ? calcBmi(s) : s[seState.project];
        if (v != null && v !== '') done++;
    });
    return { done, total: students.length };
}

// 按分组方式把全班拆成若干组
function buildSeGroups(list, mode) {
    const byHAsc = (a, b) => (a.height ?? 999) - (b.height ?? 999);
    const byHDesc = (a, b) => (b.height ?? -1) - (a.height ?? -1);
    if (mode === 'default') return [{ icon: '📋', title: '全班', students: list.slice() }];
    if (mode === 'gender') {
        const boys = list.filter(s => s.gender === '男').sort(byHDesc);
        const girls = list.filter(s => s.gender === '女').sort(byHDesc);
        const g = [];
        if (boys.length) g.push({ icon: '👦', title: '男生', students: boys });
        if (girls.length) g.push({ icon: '👧', title: '女生', students: girls });
        return g;
    }
    if (mode === 'height') {
        // 按身高连续递增排序（不再分矮/中/高三档）
        const sorted = list.slice().sort(byHAsc);
        return [{ icon: '📏', title: '按身高（矮 → 高）', students: sorted }];
    }
    if (mode === 'gender-height') {
        // 2男2女组合：身高递增，每「2男 + 2女」成一组
        const boys = list.filter(s => s.gender === '男').sort(byHAsc);
        const girls = list.filter(s => s.gender === '女').sort(byHAsc);
        const groups = [];
        let i = 0;
        while (i < boys.length || i < girls.length) {
            const chunk = [];
            for (let k = 0; k < 2 && i + k < boys.length; k++) chunk.push(boys[i + k]);
            for (let k = 0; k < 2 && i + k < girls.length; k++) chunk.push(girls[i + k]);
            if (chunk.length === 0) break;
            groups.push({ icon: '👫', title: `第${groups.length + 1}组（2男2女）`, students: chunk });
            i += 2;
        }
        return groups;
    }
    if (mode === 'lane-1234') {
        // 1234 分组：男 1/3/5…、男 2/4/6…、女 1/3/5…、女 2/4/6…
        const boys = list.filter(s => s.gender === '男').sort(byHAsc);
        const girls = list.filter(s => s.gender === '女').sort(byHAsc);
        const odd = arr => arr.filter((_, idx) => idx % 2 === 0);
        const even = arr => arr.filter((_, idx) => idx % 2 === 1);
        const g = [];
        if (boys.length) {
            const bOdd = odd(boys), bEven = even(boys);
            if (bOdd.length) g.push({ icon: '1️⃣', title: '第1排 男生（身高 1/3/5…）', students: bOdd });
            if (bEven.length) g.push({ icon: '2️⃣', title: '第2排 男生（身高 2/4/6…）', students: bEven });
        }
        if (girls.length) {
            const gOdd = odd(girls), gEven = even(girls);
            if (gOdd.length) g.push({ icon: '3️⃣', title: '第3排 女生（身高 1/3/5…）', students: gOdd });
            if (gEven.length) g.push({ icon: '4️⃣', title: '第4排 女生（身高 2/4/6…）', students: gEven });
        }
        return g;
    }
    return [{ icon: '📋', title: '全班', students: list.slice() }];
}

// 生成单行 HTML（分组时复用，idx 为原名单序号）
function seRowHtml(s, idx, showH, projInfo) {
    const isLeave = !!seState.leaveMap[s.no];
    const isBmi = seState.project === 'bmi';
    const bmiVal = isBmi ? calcBmi(s) : null;
    const rawVal = isBmi ? (bmiVal == null ? '' : bmiVal) : ((s[seState.project] === null || s[seState.project] === undefined) ? '' : s[seState.project]);
    const score100 = (!isLeave && rawVal !== '') ? getScore100(seState.project, parseFloat(rawVal), s.gender, s.grade) : null;
    const band = scoreBand(score100);
    const scoreTxt = score100 == null ? '—' : `${score100} 分`;
    let scoreCell;
    if (isBmi) {
        const cat = bmiVal != null ? getBmiLabel(bmiVal, s.gender, s.grade) : '';
        const bmiOut = bmiVal != null
            ? `BMI <b>${bmiVal}</b> <span class="se-bmi-tag">${cat}</span>`
            : `填身高/体重自动算`;
        scoreCell = `<div class="se-score-wrap se-score-bmi">
            <div class="se-bmi-row">
                <label class="se-bmi-input"><input type="number" step="0.1" min="50" max="220" value="${s.height ?? ''}" data-no="${s.no}" data-field="height" onchange="seOnBmi(${s.no},'height',this.value)" ${isLeave ? 'disabled' : ''} placeholder="身高"><span>cm</span></label>
                <label class="se-bmi-input"><input type="number" step="0.1" min="10" max="200" value="${s.weight ?? ''}" data-no="${s.no}" data-field="weight" onchange="seOnBmi(${s.no},'weight',this.value)" ${isLeave ? 'disabled' : ''} placeholder="体重"><span>kg</span></label>
            </div>
            <div class="se-bmi-out ${bmiVal != null ? '' : 'se-bmi-out-empty'}">${bmiOut}</div>
        </div>`;
    } else {
        scoreCell = `<div class="se-score-wrap">
            <input type="number" step="${projInfo.step}" min="${projInfo.min}" max="${projInfo.max}" class="se-score-input" value="${rawVal}" data-no="${s.no}" onchange="seOnScore(${s.no}, this.value)" ${isLeave ? 'disabled' : ''} placeholder="—">
            ${projInfo.unit ? `<span class="se-score-unit">${projInfo.unit}</span>` : ''}
        </div>`;
    }
    const hTag = (showH && s.height != null) ? `<span class="se-row-h">${s.height}cm</span>` : '';
    return `<tr data-no="${s.no}" class="${isLeave ? 'se-row-leave' : ''}">
        <td class="se-col-idx">${idx + 1}</td>
        <td class="se-col-name" title="${esc(s.name)} · ${esc(s.gender)}">${esc(s.name)} ${hTag}</td>
        <td class="se-col-score">${scoreCell}</td>
        <td class="se-col-level"><span class="se-level se-level-${band}">${scoreTxt}</span></td>
    </tr>`;
}

function renderSeEntryTable() {
    const klass = seState.klass;
    if (!klass) return;
    const list = appData.students[klass] || [];
    const project = seState.project;
    const projInfo = SE_PROJECTS.find(p => p.code === project);
    document.getElementById('seEntryTitle').textContent = `${klass.replace('班','')}班 · ${projInfo.name}`;

    // 一分钟跳绳：显示「一分钟计时音乐」按钮，其它项目隐藏并停止播放
    const ropeBtn = document.getElementById('ropeMusicBtn');
    if (ropeBtn) {
        const isRope = seState.project === 'skipRope';
        ropeBtn.style.display = isRope ? '' : 'none';
        if (!isRope) pauseRopeMusic();
    }

    // 分组方式
    const gmSel = document.getElementById('seGroupMode');
    if (gmSel) {
        if (!seState.groupMode) seState.groupMode = 'default';
        gmSel.value = seState.groupMode;
    }
    const mode = seState.groupMode || 'default';
    const showH = (mode === 'height' || mode === 'gender-height' || mode === 'lane-1234');
    const idxOf = {}; list.forEach((s, i) => idxOf[s.no] = i);
    const groups = buildSeGroups(list, mode);

    const tbody = document.getElementById('seTbody');
    let html = '';
    groups.forEach(g => {
        if (mode !== 'default') {
            const pr = seGroupProgress(g.students);
            html += `<tr class="se-group-row"><td colspan="4">${g.icon} <b>${g.title}</b> <span class="se-group-count">${g.students.length}人 · 已完成 ${pr.done}/${pr.total}</span></td></tr>`;
        }
        html += g.students.map(s => seRowHtml(s, idxOf[s.no], showH, projInfo)).join('');
    });
    tbody.innerHTML = html;
    const hint = document.getElementById('seGroupHint');
    if (hint) hint.textContent = mode === 'default' ? '当前按名单顺序录入' : '已分组，可分批叫号快速录入';
    updateSeProgress();
}

// 局部刷新分组头「已完成 X/Y」，避免整表重渲染导致输入框失焦
function updateSeGroupCounts() {
    const klass = seState.klass;
    if (!klass) return;
    const list = appData.students[klass] || [];
    const groups = buildSeGroups(list, seState.groupMode || 'default');
    const rows = document.querySelectorAll('#seTbody tr.se-group-row');
    rows.forEach((tr, i) => {
        const g = groups[i];
        if (!g) return;
        const pr = seGroupProgress(g.students);
        const span = tr.querySelector('.se-group-count');
        if (span) span.textContent = `${g.students.length}人 · 已完成 ${pr.done}/${pr.total}`;
    });
}

// 切换分组方式
function seOnGroupMode(val) {
    seState.groupMode = val;
    renderSeEntryTable();
}

function seOnScore(no, value) {
    const klass = seState.klass;
    if (!klass) return;
    const s = (appData.students[klass] || []).find(x => x.no === no);
    if (!s) return;
    s[seState.project] = (value === '' || isNaN(parseFloat(value))) ? null : parseFloat(value);
    saveAppData();
    const tr = document.querySelector(`tr[data-no="${no}"]`);
    if (tr) {
        const score100 = (seState.leaveMap[no] || value === '' || value == null) ? null : getScore100(seState.project, parseFloat(value), s.gender, s.grade);
        const band = scoreBand(score100);
        const cell = tr.querySelector('.se-level');
        if (cell) {
            cell.className = `se-level se-level-${band}`;
            cell.textContent = score100 == null ? '—' : `${score100} 分`;
        }
        if (seState.project === 'bmi' && value !== '') {
            const tag = tr.querySelector('.se-bmi-tag');
            if (tag) tag.textContent = getBmiLabel(parseFloat(value), s.gender, s.grade);
        }
    }
    updateSeProgress();
    updateSeGroupCounts();
}

// BMI 项：录入身高/体重，自动算 BMI + 得分（同步写 height/weight/bmi 三个字段）
function seOnBmi(no, field, value) {
    const klass = seState.klass;
    if (!klass) return;
    const s = (appData.students[klass] || []).find(x => x.no === no);
    if (!s) return;
    s[field] = (value === '' || isNaN(parseFloat(value))) ? null : parseFloat(value);
    s.bmi = calcBmi(s);
    saveAppData();
    const tr = document.querySelector(`tr[data-no="${no}"]`);
    if (tr) {
        const bmiVal = calcBmi(s);
        const out = tr.querySelector('.se-bmi-out');
        if (out) {
            if (bmiVal != null) {
                out.classList.remove('se-bmi-out-empty');
                out.innerHTML = `BMI <b>${bmiVal}</b> <span class="se-bmi-tag">${getBmiLabel(bmiVal, s.gender, s.grade)}</span>`;
            } else {
                out.classList.add('se-bmi-out-empty');
                out.textContent = '填身高/体重自动算';
            }
        }
        const score100 = bmiVal == null ? null : getScore100('bmi', bmiVal, s.gender, s.grade);
        const band = scoreBand(score100);
        const cell = tr.querySelector('.se-level');
        if (cell) {
            cell.className = `se-level se-level-${band}`;
            cell.textContent = score100 == null ? '—' : `${score100} 分`;
        }
    }
    updateSeProgress();
    updateSeGroupCounts();
}

function seToggleLeave(no) {
    const klass = seState.klass;
    if (!klass) return;
    const s = (appData.students[klass] || []).find(x => x.no === no);
    if (!s) return;
    seState.leaveMap[no] = !seState.leaveMap[no];
    if (seState.leaveMap[no]) {
        if (seState.project === 'bmi') { s.height = null; s.weight = null; s.bmi = null; }
        else s[seState.project] = null;
        saveAppData();
    }
    renderSeEntryTable();
}

function updateSeProgress() {
    const klass = seState.klass;
    const list = appData.students[klass] || [];
    const total = list.length;
    let done = 0, leave = 0;
    list.forEach(s => {
        if (seState.leaveMap[s.no]) leave++;
        else if (seState.project === 'bmi'
            ? (s.height != null && s.height !== '' && s.weight != null && s.weight !== '')
            : (s[seState.project] != null && s[seState.project] !== '')) done++;
    });
    const pct = total ? Math.round(((done + leave) / total) * 100) : 0;
    document.getElementById('seProgress').style.width = pct + '%';
    document.getElementById('seProgressText').innerHTML =
        `完成率 <b>${pct}%</b> · 已录入 <b>${done}</b>/${total} · 请假 ${leave}`;
}

function seExportCurrent() {
    const klass = seState.klass;
    if (!klass) return;
    const projInfo = SE_PROJECTS.find(p => p.code === seState.project);
    const list = appData.students[klass] || [];
    const rows = [['序号','姓名','性别','成绩','得分(百分制)']];
    list.forEach((s, idx) => {
        const isLeave = !!seState.leaveMap[s.no];
        if (seState.project === 'bmi') {
            const bmiVal = calcBmi(s);
            const score100 = (isLeave || bmiVal == null) ? null : getScore100('bmi', bmiVal, s.gender, s.grade);
            const scoreTxt = isLeave ? '请假' : (bmiVal == null ? '未录入' : `${score100} 分`);
            const mark = `身高${s.height ?? ''}cm/体重${s.weight ?? ''}kg/BMI${bmiVal ?? ''}`;
            rows.push([idx + 1, s.name, s.gender, mark, scoreTxt]);
            return;
        }
        const val = s[seState.project];
        const score100 = (isLeave || val == null) ? null : getScore100(seState.project, parseFloat(val), s.gender, s.grade);
        const scoreTxt = isLeave ? '请假' : (val == null ? '未录入' : `${score100} 分`);
        rows.push([idx + 1, s.name, s.gender, val == null ? '' : val, scoreTxt]);
    });
    const csv = '\uFEFF' + rows.map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${klass}_${projInfo.name}_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    showToast('已导出 CSV', 'success');
}

function seSaveAndNext() {
    const klass = seState.klass;
    if (!klass) return;
    const list = appData.students[klass] || [];
    let saved = 0;
    list.forEach(s => {
        const entered = seState.project === 'bmi'
            ? (s.height != null && s.height !== '' && s.weight != null && s.weight !== '')
            : (s[seState.project] != null && s[seState.project] !== '');
        if (entered) {
            archiveCurrentScores(s);
            saved++;
        }
    });
    saveAppData();
    showToast(`已保存 ${saved} 条成绩`, 'success');
    setTimeout(() => navigateTo('roster'), 700);
}

// ===== 现场测速：秒表 + 成绩匹配 =====
const SE_LANE_SIZE = 4;
let stopwatch = { running: false, startTs: 0, splits: [], rafId: 0 };
let matchState = { assigned: {} };

function openStopwatch() {
    if (seState.step !== 3) { showToast('请先进入"录入成绩"页面', ''); return; }
    const proj = SE_PROJECTS.find(p => p.code === seState.project);
    const lbl = document.getElementById('swProjectLabel');
    if (lbl && proj) lbl.textContent = proj.name + ' 秒表';
    renderSwSplits();
    refreshStopwatchButtons();
    const overlay = document.getElementById('stopwatchModal');
    overlay.style.display = 'block';
    overlay.classList.remove('collapsed');
    if (stopwatch.running && !stopwatch.rafId) tickStopwatch();
}

// 折叠/展开秒表浮窗：true=折叠成小气泡，false=展开完整卡片
function toggleSwFloat(collapse) {
    const overlay = document.getElementById('stopwatchModal');
    if (!overlay) return;
    if (collapse) overlay.classList.add('collapsed');
    else overlay.classList.remove('collapsed');
    updateSwBubble();
}

// 更新折叠状态气泡上的「已记录 N/4」文字
function updateSwBubble() {
    const bubbleText = document.getElementById('swBubbleText');
    const bubbleCount = document.getElementById('swBubbleCount');
    if (bubbleText) bubbleText.textContent = stopwatch.running ? '正在计时…' : '秒表已收起';
    if (bubbleCount) {
        const n = stopwatch.splits.length;
        const full = n >= SE_LANE_SIZE;
        bubbleCount.textContent = `${n}/${SE_LANE_SIZE}`;
        bubbleCount.classList.toggle('done', full);
    }
}

function closeStopwatch() {
    const overlay = document.getElementById('stopwatchModal');
    if (overlay) overlay.style.display = 'none';
}

function tickStopwatch() {
    if (!stopwatch.running) { stopwatch.rafId = 0; return; }
    const elapsed = (performance.now() - stopwatch.startTs) / 1000;
    const disp = document.getElementById('swDisplay');
    if (disp) disp.textContent = elapsed.toFixed(2);
    stopwatch.rafId = requestAnimationFrame(tickStopwatch);
}

function startStopwatch() {
    if (stopwatch.running) return;
    if (stopwatch.splits.length >= SE_LANE_SIZE) return;
    stopwatch.running = true;
    stopwatch.startTs = performance.now();
    refreshStopwatchButtons();
    tickStopwatch();
}

function lapStopwatch() {
    if (!stopwatch.running) return;
    if (stopwatch.splits.length >= SE_LANE_SIZE) {
        showToast('本轮 4 人已记完，直接点秒表里的「复制」即可', '');
        return;
    }
    const elapsed = (performance.now() - stopwatch.startTs) / 1000;
    stopwatch.splits.push(+elapsed.toFixed(2));
    renderSwSplits();
    refreshStopwatchButtons();
    if (stopwatch.splits.length >= SE_LANE_SIZE) {
        stopwatch.running = false;
        if (stopwatch.rafId) cancelAnimationFrame(stopwatch.rafId);
        stopwatch.rafId = 0;
        refreshStopwatchButtons();
        showToast('4 个成绩已记完！点每个成绩的「复制」粘贴到同学成绩栏', 'success');
    }
}

function resetStopwatch() {
    if (stopwatch.rafId) cancelAnimationFrame(stopwatch.rafId);
    stopwatch = { running: false, startTs: 0, splits: [], rafId: 0 };
    matchState = { assigned: {} };
    renderSwSplits();
    updateMatchBadge();
    refreshStopwatchButtons();
    const disp = document.getElementById('swDisplay');
    if (disp) disp.textContent = '0.00';
    const mb = document.getElementById('matchBarBtn');
    if (mb) mb.classList.remove('ready');
}

function renderSwSplits() {
    const box = document.getElementById('swSplits');
    if (!box) return;
    const proj = SE_PROJECTS.find(p => p.code === seState.project);
    const unit = proj?.unit || '';
    let html = '';
    for (let i = 0; i < SE_LANE_SIZE; i++) {
        const v = stopwatch.splits[i];
        const filled = v != null;
        html += `<div class="sw-slot ${filled ? 'filled' : ''}">
            <div class="sw-slot-idx">${i + 1}</div>
            <div class="sw-slot-val">${filled ? v.toFixed(2) : '—'}</div>
            <div class="sw-slot-unit">${unit}</div>
            ${filled ? `<button type="button" class="sw-copy-btn" onclick="copySplit(${i})">复制</button>` : ''}
        </div>`;
    }
    if (stopwatch.splits.length >= SE_LANE_SIZE) {
        html += `<div class="sw-done-tip">✅ ${SE_LANE_SIZE} 人已全部冲线：点每个成绩的「复制」，再粘贴到对应同学的成绩栏</div>`;
    }
    box.innerHTML = html;
    updateSwBubble();
}

// 复制某个秒表成绩（仅秒数，方便粘贴到学生成绩栏）
function copySplit(i) {
    const v = stopwatch.splits[i];
    if (v == null) return;
    const text = v.toFixed(2);
    const ok = () => showToast(`已复制第 ${i + 1} 个成绩：${text} 秒，去粘贴到对应同学`, 'success');
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(ok).catch(() => fallbackCopy(text, ok));
    } else {
        fallbackCopy(text, ok);
    }
}
function fallbackCopy(text, cb) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.top = '-9999px';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    try { document.execCommand('copy'); if (cb) cb(); }
    catch (e) { showToast('复制失败，请手动记录：' + text, ''); }
    document.body.removeChild(ta);
}

function refreshStopwatchButtons() {
    const startBtn = document.getElementById('swStartBtn');
    const lapBtn = document.getElementById('swLapBtn');
    const resetBtn = document.getElementById('swResetBtn');
    if (!startBtn) return;
    const full = stopwatch.splits.length >= SE_LANE_SIZE;
    if (stopwatch.running) {
        startBtn.textContent = '运行中'; startBtn.disabled = true; lapBtn.disabled = full; resetBtn.disabled = false;
    } else if (full) {
        startBtn.textContent = '已完成 4 人'; startBtn.disabled = true; lapBtn.disabled = true; resetBtn.disabled = false;
    } else if (stopwatch.splits.length === 0) {
        startBtn.textContent = '开始'; startBtn.disabled = false; lapBtn.disabled = true; resetBtn.disabled = true;
    } else {
        startBtn.textContent = '继续'; startBtn.disabled = false; lapBtn.disabled = false; resetBtn.disabled = false;
    }
}

function updateMatchBadge() {
    const n = stopwatch.splits.length;
    const badge = document.getElementById('matchBadge');
    if (badge) {
        if (n > 0) { badge.style.display = 'inline-block'; badge.textContent = n; }
        else { badge.style.display = 'none'; }
    }
}

// ===== 成绩匹配面板 =====
function openMatchModal() {
    if (seState.step !== 3) { showToast('请先进入"录入成绩"页面', ''); return; }
    if (!stopwatch.splits.length) { showToast('还没有秒表成绩，先去秒表计时', ''); return; }
    if (!seState.klass) { showToast('请先选择班级', ''); return; }
    renderMatchPanel();
    document.getElementById('matchModal').style.display = 'flex';
}

function closeMatchModal() { document.getElementById('matchModal').style.display = 'none'; }

// 下一个待分配的名次（0=第1名）；没有空位返回 -1
function matchLowestFreeRank() {
    for (let i = 0; i < SE_LANE_SIZE; i++) if (matchState.assigned[i] == null) return i;
    return -1;
}

function renderMatchPanel() {
    const proj = SE_PROJECTS.find(p => p.code === seState.project);
    const unit = proj?.unit || '';
    const list = appData.students[seState.klass] || [];
    const nextRank = matchLowestFreeRank();
    const allDone = nextRank === -1;

    // —— 名次成绩卡（第1~4名）——
    const timesBox = document.getElementById('matchTimes');
    let html = '';
    for (let i = 0; i < SE_LANE_SIZE; i++) {
        const v = stopwatch.splits[i];
        const has = v != null;
        const filled = matchState.assigned[i] != null;
        const isCurrent = (i === nextRank) && has;
        const name = filled ? (list[matchState.assigned[i]]?.name || '') : '';
        const cls = ['match-time'];
        if (isCurrent) cls.push('active');
        if (filled) cls.push('filled');
        if (allDone) cls.push('all-done');
        html += `<div class="${cls.join(' ')}" ${filled ? `onclick="unassignRank(${i})" title="点此取消该名次"` : ''}>
            <div class="match-time-idx">第 ${i + 1} 名${filled ? ' <span class="match-time-x">×</span>' : (isCurrent ? ' · 待分配' : '')}</div>
            <div class="match-time-val">${has ? v.toFixed(2) : '—'}</div>
            <div class="match-time-unit">${unit}</div>
            ${filled ? `<div class="match-time-name">→ ${escapeHtml(name)}</div>` : ''}
        </div>`;
    }
    timesBox.innerHTML = html;

    // —— 当前分配状态条 ——
    const statusEl = document.getElementById('matchStatus');
    if (statusEl) {
        if (allDone) {
            statusEl.innerHTML = '✅ 本轮 4 人成绩已全部录入，可点下方"开始下一组"';
            statusEl.className = 'match-status done';
        } else {
            statusEl.innerHTML = `👉 现在分配：<b>第 ${nextRank + 1} 名</b>（${stopwatch.splits[nextRank] != null ? stopwatch.splits[nextRank].toFixed(2) : '—'}${unit}）— 点对应学生姓名`;
            statusEl.className = 'match-status';
        }
    }

    // —— 学生网格 ——
    const assignedSet = new Set(Object.values(matchState.assigned));
    const stuBox = document.getElementById('matchStudents');
    stuBox.innerHTML = list.map((s, idx) => {
        if (seState.leaveMap[s.no]) {
            return `<div class="match-stu disabled">
                <div class="match-stu-lane">${getStudentLaneLabel(idx)}</div>
                <div class="match-stu-name">${escapeHtml(s.name)}</div>
                <div class="match-stu-tag">请假</div>
            </div>`;
        }
        if (assignedSet.has(idx)) {
            const rank = Object.keys(matchState.assigned).find(k => matchState.assigned[k] === idx);
            return `<div class="match-stu done" onclick="unassignStudent(${idx})">
                <div class="match-stu-lane">${getStudentLaneLabel(idx)}</div>
                <div class="match-stu-name">${escapeHtml(s.name)}</div>
                <div class="match-stu-tag">第 ${parseInt(rank) + 1} 名 · ${stopwatch.splits[rank] != null ? stopwatch.splits[rank].toFixed(2) : '—'}${unit}（点取消）</div>
            </div>`;
        }
        return `<div class="match-stu" onclick="assignStudentToNextRank(${idx})">
            <div class="match-stu-lane">${getStudentLaneLabel(idx)}</div>
            <div class="match-stu-name">${escapeHtml(s.name)}</div>
            <div class="match-stu-tag">点此分配</div>
        </div>`;
    }).join('');
}

function getStudentLaneLabel(idx) {
    const group = Math.floor(idx / seState.groupSize) + 1;
    const lane = (idx % seState.groupSize) + 1;
    return `${group}组${lane}`;
}

// 点学生姓名 → 自动分配到"下一个待分配名次"（第1名→第2名→第3名→第4名）
function assignStudentToNextRank(studentIdx) {
    // 已分配过该学生 → 视为取消重选
    const existing = Object.keys(matchState.assigned).find(k => matchState.assigned[k] === studentIdx);
    if (existing != null) { clearRank(parseInt(existing)); return; }
    const rank = matchLowestFreeRank();
    if (rank === -1) { showToast('4 个名次都已分配', ''); return; }
    if (stopwatch.splits[rank] == null) { showToast('秒表第 ' + (rank + 1) + ' 名成绩还没记录', ''); return; }
    const value = stopwatch.splits[rank];
    const list = appData.students[seState.klass];
    const s = list[studentIdx];
    if (!s) return;
    s[seState.project] = value;
    if (!Array.isArray(s.history)) s.history = [];
    const today = new Date().toISOString().slice(0, 10);
    s.history.push({ date: today, item: seState.project, value, source: '秒表匹配' });
    saveAppData();
    matchState.assigned[rank] = studentIdx;
    showToast(`${s.name} → 第 ${rank + 1} 名：${value.toFixed(2)} ${TEST_ITEMS[seState.project]?.unit || ''}`, 'success');
    renderMatchPanel();
    renderSeEntryTable();
}

// 点已分配的学生 → 取消其名次（成绩一并清空，可重新点分配）
function unassignStudent(studentIdx) {
    const rank = Object.keys(matchState.assigned).find(k => matchState.assigned[k] === studentIdx);
    if (rank == null) return;
    clearRank(parseInt(rank));
}

function unassignRank(rank) { clearRank(rank); }

function clearRank(rank) {
    const stuIdx = matchState.assigned[rank];
    if (stuIdx == null) return;
    const list = appData.students[seState.klass] || [];
    const s = list[stuIdx];
    if (s) {
        s[seState.project] = null;
        if (Array.isArray(s.history)) {
            s.history = s.history.filter(h => !(h.item === seState.project && h.value === stopwatch.splits[rank] && h.source === '秒表匹配'));
        }
        saveAppData();
    }
    delete matchState.assigned[rank];
    showToast(`已取消第 ${rank + 1} 名（${s ? s.name : ''}）`, '');
    renderMatchPanel();
    renderSeEntryTable();
}

// 本轮 4 人录完 → 清空，开始下一组
function matchNextGroup() {
    resetStopwatch();
    renderMatchPanel();
    showToast('已清空，请重新计时下一组', 'success');
}

function initToolbox() {
    if (typeof TRAINING === 'undefined') return;
    fillSelect('genGrade', TRAINING.grades);
    fillSelect('genDuration', Object.keys(TRAINING.durations));
    fillSelect('genFocus', TRAINING.focusList);
    fillSelect('genEquip', TRAINING.equipment);

    const cats = ['全部', ...GAME_CATEGORIES];
    document.getElementById('gameCats').innerHTML = cats.map(c =>
        `<div class="game-cat ${c === '全部' ? 'active' : ''}" data-cat="${esc(c)}" onclick="selectGameCat('${esc(c)}')">${esc(c)}</div>`
    ).join('');
    const gs = document.getElementById('gameSearch');
    if (gs) gs.addEventListener('input', renderGames);

    fillSelect('logClass', Object.keys(appData.students));
    document.getElementById('logDate').value = new Date().toISOString().slice(0, 10);
    document.querySelectorAll('.perf-btn').forEach(b => b.addEventListener('click', () => {
        document.querySelectorAll('.perf-btn').forEach(x => x.classList.remove('active'));
        b.classList.add('active');
        currentPerf = b.dataset.perf;
    }));
    document.getElementById('logClass').addEventListener('change', updateLogShould);

    const tabs = document.getElementById('toolboxTabs');
    if (tabs) tabs.addEventListener('click', e => {
        const btn = e.target.closest('.ttab-btn');
        if (btn) switchToolboxTab(btn.dataset.ttab);
    });

    renderGames();
    renderComms();
    renderLogHistory();
    updateLogShould();
}

function switchToolboxTab(ttab) {
    document.querySelectorAll('.ttab-btn').forEach(b => b.classList.toggle('active', b.dataset.ttab === ttab));
    document.querySelectorAll('.ttab-content').forEach(c => c.classList.toggle('active', c.id === 'ttab-' + ttab));
}

function renderToolbox() {
    renderGames();
    renderComms();
    renderLogHistory();
}

// ---------- 训练计划生成器 ----------
function generatePlan() {
    const grade = document.getElementById('genGrade').value;
    const duration = document.getElementById('genDuration').value;
    const focus = document.getElementById('genFocus').value;
    const equip = document.getElementById('genEquip').value;
    const alloc = TRAINING.durations[duration];
    const main = TRAINING.main[focus];
    const warms = (TRAINING.warmups[focus] || TRAINING.warmups['综合']);
    const cools = TRAINING.cooldowns;
    const safety = TRAINING.safety[focus] || '注意充分热身与放松，关注学生身体状况，安全第一。';

    const plan = {
        header: `${grade}《${main.title}》训练计划`,
        meta: [
            ['课时', duration],
            ['训练重点', focus],
            ['器材', equip],
            ['时间分配', `开始${alloc.开始}′·准备${alloc.准备}′·基本${alloc.基本}′·结束${alloc.结束}′`],
        ],
        alloc,
        start: '体育委员整队报告人数 → 师生问好 → 宣布本课内容与安全要求 → 安排见习生。',
        warmups: warms.map(w => `${w.name}：${w.desc}`),
        goals: main.goals,
        mains: main.steps,
        game: main.game,
        cools: cools.map(c => `${c.name}：${c.desc}`),
        safety,
    };
    window._currentPlan = plan;
    document.getElementById('genOutput').innerHTML =
        planToHTML(plan) +
        `<div class="plan-actions">
            <button class="btn" onclick="copyPlan()">📋 复制计划</button>
            <button class="btn btn-outline" onclick="printPlan()">🖨️ 打印 / 导出PDF</button>
        </div>`;
    document.getElementById('genOutput').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function planToHTML(p) {
    const a = p.alloc;
    return `<div class="plan-card">
        <div class="plan-title">${esc(p.header)}</div>
        <div class="plan-meta">${p.meta.map(m => `<span><b>${esc(m[0])}</b> ${esc(m[1])}</span>`).join('')}</div>
        <div class="plan-section"><h4>🚩 开始部分（约${a.开始}分钟）</h4><p>${esc(p.start)}</p></div>
        <div class="plan-section"><h4>🔥 准备部分 · 热身（约${a.准备}分钟）</h4><ul>${p.warmups.map(w => `<li>${esc(w)}</li>`).join('')}</ul></div>
        <div class="plan-section"><h4>🏋️ 基本部分（约${a.基本}分钟）</h4>
            <p class="plan-goal">🎯 教学目标：${esc(p.goals)}</p>
            <ol>${p.mains.map(s => `<li>${esc(s)}</li>`).join('')}</ol>
            <p class="plan-game">🎮 课课练 / 游戏：<b>${esc(p.game)}</b></p>
        </div>
        <div class="plan-section"><h4>🌿 结束部分（约${a.结束}分钟）</h4><ul>${p.cools.map(c => `<li>${esc(c)}</li>`).join('')}</ul></div>
        <div class="plan-section plan-safety"><h4>⚠️ 安全提示</h4><p>${esc(p.safety)}</p></div>
    </div>`;
}

function planToText(p) {
    const a = p.alloc;
    let t = `${p.header}\n` + p.meta.map(m => `${m[0]}：${m[1]}`).join('  ') + '\n\n';
    t += `【教学目标】${p.goals}\n\n`;
    t += `一、开始部分（约${a.开始}分钟）\n${p.start}\n\n`;
    t += `二、准备部分·热身（约${a.准备}分钟）\n` + p.warmups.map((w, i) => `${i + 1}. ${w}`).join('\n') + '\n\n';
    t += `三、基本部分（约${a.基本}分钟）\n` + p.mains.map((s, i) => `${i + 1}. ${s}`).join('\n') + `\n游戏：${p.game}\n\n`;
    t += `四、结束部分（约${a.结束}分钟）\n` + p.cools.map((c, i) => `${i + 1}. ${c}`).join('\n') + '\n\n';
    t += `【安全提示】${p.safety}\n`;
    return t;
}

function copyPlan() {
    if (window._currentPlan) copyText(planToText(window._currentPlan));
}

function printPlan() {
    const p = window._currentPlan;
    if (!p) return;
    const w = window.open('', '_blank');
    w.document.write(`<html><head><meta charset="utf-8"><title>${esc(p.header)}</title>
<style>body{font-family:'Microsoft YaHei',sans-serif;padding:24px;line-height:1.7;color:#222}
h1{font-size:20px;text-align:center}.meta{display:flex;flex-wrap:wrap;gap:12px;justify-content:center;color:#555;font-size:13px;margin:8px 0 16px}
h4{margin:14px 0 6px;color:#388E3C}ul,ol{margin-left:20px}.safety{background:#FFF3E0;padding:10px;border-radius:8px}@media print{body{padding:0}}</style></head>
<body>${planToHTML(p)}<script>window.onload=function(){window.print();}<\/script></body></html>`);
    w.document.close();
}

// ---------- 体育游戏库 ----------
function renderGames() {
    const gs = document.getElementById('gameSearch');
    const search = (gs ? gs.value : '').trim().toLowerCase();
    let list = GAMES.filter(g =>
        (currentGameCat === '全部' || g.cat === currentGameCat) &&
        (!search || g.name.toLowerCase().includes(search))
    );
    const grid = document.getElementById('gameGrid');
    if (!list.length) { grid.innerHTML = '<div class="empty-tip">未找到匹配的游戏</div>'; return; }
    grid.innerHTML = list.map(g => `<div class="game-card" onclick="showGameDetail('${esc(g.name)}')">
        <span class="game-cat-tag cat-${esc(g.cat)}">${esc(g.cat)}</span>
        <div class="game-name">${esc(g.name)}</div>
        <div class="game-meta">👥${esc(g.people)} · 📍${esc(g.space)} · 🕒${esc(g.time)}</div>
    </div>`).join('');
}

function selectGameCat(cat) {
    currentGameCat = cat;
    document.querySelectorAll('.game-cat').forEach(x => x.classList.toggle('active', x.dataset.cat === cat));
    renderGames();
}

function showGameDetail(name) {
    const g = GAMES.find(x => x.name === name);
    if (!g) return;
    document.getElementById('modalToolboxTitle').textContent = g.name;
    document.getElementById('modalToolboxBody').innerHTML = `
        <div class="detail-section"><span class="game-cat-tag cat-${esc(g.cat)}">${esc(g.cat)}</span></div>
        <div class="detail-grid">
            <div><b>适用人数</b>${esc(g.people)}</div>
            <div><b>场地</b>${esc(g.space)}</div>
            <div><b>器材</b>${esc(g.equip)}</div>
            <div><b>时长</b>${esc(g.time)}</div>
        </div>
        <div class="detail-section"><h4>📋 玩法规则</h4><div class="detail-content">${esc(g.rules)}</div></div>
        <div class="detail-section plan-safety"><h4>⚠️ 安全提示</h4><div class="detail-content">${esc(g.safety)}</div></div>`;
    openModal('toolboxModal');
}

// ---------- 家校话术库 ----------
function renderComms() {
    const grid = document.getElementById('commsGrid');
    if (!grid) return;
    grid.innerHTML = COMMS.map((c, i) => `<div class="comms-card">
        <div class="comms-scenario">${esc(c.scenario)}</div>
        <div class="comms-title">${esc(c.title)}</div>
        <div class="comms-text">${esc(c.text)}</div>
        <button class="btn btn-sm" onclick="copyComms(${i})">📋 复制话术</button>
    </div>`).join('');
}

function copyComms(i) { copyText(COMMS[i].text); }

// ---------- 课堂打卡记录 ----------
function updateLogShould() {
    const cls = document.getElementById('logClass').value;
    const n = appData.students[cls] ? appData.students[cls].length : 0;
    const hint = document.getElementById('logShould');
    const input = document.getElementById('logShouldInput');
    if (hint) hint.textContent = n ? `（共${n}人）` : '';
    if (input) input.value = n;
}

function saveClassLog() {
    const cls = document.getElementById('logClass').value;
    if (!cls) { showToast('请选择班级'); return; }
    if (!currentPerf) { showToast('请选择课堂表现'); return; }
    const date = document.getElementById('logDate').value || new Date().toISOString().slice(0, 10);
    const content = (document.getElementById('logContent').value || '').trim() || '(未填写)';
    const should = parseInt(document.getElementById('logShouldInput').value) || 0;
    const actual = parseInt(document.getElementById('logActual').value) || 0;
    const leave = parseInt(document.getElementById('logLeave').value) || 0;
    const note = (document.getElementById('logNote').value || '').trim();

    appData.logs.unshift({ id: Date.now(), date, cls, content, should, actual, leave, perf: currentPerf, note });
    saveAppData();
    renderLogHistory();

    document.getElementById('logContent').value = '';
    document.getElementById('logActual').value = '';
    document.getElementById('logLeave').value = '';
    document.getElementById('logNote').value = '';
    document.querySelectorAll('.perf-btn').forEach(b => b.classList.remove('active'));
    currentPerf = '';
    showToast('已保存本节课记录', 'success');
}

function renderLogHistory() {
    const box = document.getElementById('logHistory');
    if (!box) return;
    if (!appData.logs.length) {
        box.innerHTML = '<div class="empty-tip">还没有打卡记录，上完课记得来记一笔～</div>';
        return;
    }
    box.innerHTML = appData.logs.map(l => `<div class="log-item">
        <div class="log-item-head">
            <span class="log-date">📅 ${esc(l.date)}</span>
            <span class="log-cls">${esc(l.cls)}</span>
            <span class="log-perf perf-${esc(l.perf)}">${esc(l.perf)}</span>
            <button class="log-del" onclick="deleteLog(${l.id})">🗑</button>
        </div>
        <div class="log-item-content">📝 ${esc(l.content)}</div>
        <div class="log-item-stat">应到 ${l.should} · 实到 ${l.actual} · 请假 ${l.leave}${l.note ? (' · 📌 ' + esc(l.note)) : ''}</div>
    </div>`).join('');
}

function deleteLog(id) {
    appData.logs = appData.logs.filter(l => l.id !== id);
    saveAppData();
    renderLogHistory();
    showToast('已删除该记录');
}

// ---------- 通用复制 ----------
function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text).then(
            () => showToast('已复制到剪贴板', 'success'),
            () => fallbackCopy(text)
        );
    } else {
        fallbackCopy(text);
    }
}

function fallbackCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try {
        document.execCommand('copy');
        showToast('已复制到剪贴板', 'success');
    } catch (e) {
        showToast('复制失败，请手动选择文字');
    }
    document.body.removeChild(ta);
}

// ===== Safety =====
function initSafety() {
    const plans = [
        {
            title: '运动损伤应急处理', icon: '🩹', color: '#f44336', bg: '#FFEBEE',
            steps: [
                '立即停止运动，将受伤学生转移至安全区域',
                '判断伤情：擦伤→清洗消毒包扎；扭伤→RICE原则（休息、冰敷、加压、抬高）',
                '严重损伤（骨折、脱臼）→固定患处，禁止移动，立即拨打120',
                '通知班主任和家长，记录事故经过',
                '事后填写《学生运动伤害事故登记表》',
            ]
        },
        {
            title: '中暑急救预案', icon: '☀️', color: '#FF9800', bg: '#FFF3E0',
            steps: [
                '迅速将学生转移至阴凉通风处，解开衣扣',
                '用湿毛巾冷敷额头、腋下、腹股沟等大血管处',
                '补充淡盐水或运动饮料（少量多次）',
                '意识不清或症状严重→立即拨打120送医',
                '高温天气提前调整运动量，避免正午时段剧烈运动',
            ]
        },
        {
            title: '课堂突发事件', icon: '⚠️', color: '#2196F3', bg: '#E3F2FD',
            steps: [
                '立即吹哨停止活动，组织学生集合清点人数',
                '判断突发事件性质（学生冲突/器材故障/外来干扰）',
                '学生冲突→分开当事人，了解情况，课后教育处理',
                '器材故障→立即停用故障器材，设置警示标志',
                '外来干扰→保护学生安全，必要时联系保安或报警',
            ]
        },
        {
            title: '课前安全检查', icon: '✅', color: '#4CAF50', bg: '#E8F5E9',
            steps: [
                '检查场地：清除碎石、积水，检查地面是否平整',
                '检查器材：确认器材完好无破损，螺丝无松动',
                '检查学生着装：运动鞋、适合运动的服装、摘除尖锐饰品',
                '了解学生身体状况：询问有无身体不适、请假学生安排',
                '热身充分：确保5-8分钟热身活动，预防运动损伤',
            ]
        },
        {
            title: '哮喘/特殊体质应急', icon: '🫁', color: '#9C27B0', bg: '#F3E5F5',
            steps: [
                '事先了解班内特殊体质学生名单（哮喘、心脏病、过敏等）',
                '随身携带学生紧急联系卡和常用急救药品',
                '哮喘发作→协助使用随身吸入器，保持坐位，安抚情绪',
                '严重呼吸困难→立即拨打120，通知家长',
                '过敏反应→远离过敏源，根据情况使用抗过敏药物',
            ]
        },
        {
            title: '消防疏散预案', icon: '🔥', color: '#FF5722', bg: '#FBE9E7',
            steps: [
                '听到警报后立即停止教学活动，吹哨集合',
                '按预定路线组织学生有序撤离至操场安全区域',
                '到达安全区后清点人数，向年级组长报告',
                '协助疏散其他区域学生，维持秩序',
                '确认所有学生安全后，听从学校统一指挥',
            ]
        },
    ];
    
    document.getElementById('safetyGrid').innerHTML = plans.map(plan => `
        <div class="safety-card">
            <div class="safety-card-header" style="background:${plan.color}">
                <span style="font-size:20px;">${plan.icon}</span>
                ${plan.title}
            </div>
            <div class="safety-card-body">
                ${plan.steps.map((step, i) => `
                    <div class="safety-step">
                        <div class="safety-step-num" style="background:${plan.bg};color:${plan.color}">${i + 1}</div>
                        <div class="safety-step-content">${step}</div>
                    </div>
                `).join('')}
            </div>
        </div>
    `).join('');
}

// ===== Tracking Modal =====
function openTrackingModal() {
    document.getElementById('cardModalTitle').textContent = '学生体能学情跟踪';
    
    const cls = appData.currentClass;
    const students = appData.students[cls] || [];
    const items = getActiveItems(student.grade);
    
    // Top performers
    const topRun = [...students].filter(s => s.run50).sort((a, b) => a.run50 - b.run50).slice(0, 5);
    const topSkip = [...students].filter(s => s.skipRope).sort((a, b) => b.skipRope - a.skipRope).slice(0, 5);
    const topSitUps = [...students].filter(s => s.sitUps).sort((a, b) => b.sitUps - a.sitUps).slice(0, 5);
    const topSitReach = [...students].filter(s => s.sitReach).sort((a, b) => b.sitReach - a.sitReach).slice(0, 5);
    
    // Weak students
    const weakStudents = students.filter(s => getOverallLevel(s) === 'weak');
    
    document.getElementById('cardModalBody').innerHTML = `
        <div class="detail-section">
            <h4>🏆 50米跑 TOP5</h4>
            ${topRun.map((s, i) => `<div style="display:flex;justify-content:space-between;padding:6px 0;"><span>${i+1}. ${s.name}</span><span style="color:#4CAF50;font-weight:700;">${s.run50}秒</span></div>`).join('')}
        </div>
        <div class="detail-section">
            <h4>🪢 跳绳 TOP5</h4>
            ${topSkip.map((s, i) => `<div style="display:flex;justify-content:space-between;padding:6px 0;"><span>${i+1}. ${s.name}</span><span style="color:#26A69A;font-weight:700;">${s.skipRope}次</span></div>`).join('')}
        </div>
        <div class="detail-section">
            <h4>💪 仰卧起坐 TOP5</h4>
            ${topSitUps.map((s, i) => `<div style="display:flex;justify-content:space-between;padding:6px 0;"><span>${i+1}. ${s.name}</span><span style="color:#EF5350;font-weight:700;">${s.sitUps}次</span></div>`).join('')}
        </div>
        <div class="detail-section">
            <h4>🤸 坐位体前屈 TOP5</h4>
            ${topSitReach.map((s, i) => `<div style="display:flex;justify-content:space-between;padding:6px 0;"><span>${i+1}. ${s.name}</span><span style="color:#AB47BC;font-weight:700;">${s.sitReach}cm</span></div>`).join('')}
        </div>
        <div class="detail-section">
            <h4>⚠️ 需关注学生（体能薄弱）</h4>
            ${weakStudents.length > 0 ? weakStudents.map(s => {
                const weakItems = items.filter(i => getScoreLevel(i, s[i], s.gender, s.grade) === 'weak');
                return `<div style="padding:8px 0;border-bottom:1px solid var(--gray-100);"><strong>${s.name}</strong> — 薄弱项：${weakItems.map(i => TEST_ITEMS[i].name).join('、')}</div>`;
            }).join('') : '<div style="color:var(--gray-500);">暂无薄弱学生 ✅</div>'}
        </div>
    `;
    openModal('cardModal');
}

// ===== Games Modal =====
function openGamesModal() {
    document.getElementById('cardModalTitle').textContent = '趣味课堂游戏库';
    
    const games = [
        { name: '🏀 运球接力赛', type: '球类', desc: '学生分4组，每组排头持球运球绕标志筒折返，传给下一位。最先完成组获胜。', tags: ['篮球', '团队协作', '4组'] },
        { name: '🪢 花样跳绳挑战', type: '跳绳', desc: '单人/双人/长绳多模式轮换，设定不同难度等级，完成挑战升级。', tags: ['跳绳', '趣味', '分层'] },
        { name: '🏃 追逐闪避球', type: '跑动', desc: '两组对抗，一组在场内跑动闪避，另一组在外围投掷软球，被击中者出局。', tags: ['闪避', '团队', '软球'] },
        { name: '🎯 投准积分赛', type: '投掷', desc: '设置不同分值的目标区，学生投掷沙包命中得分，累计积分排名。', tags: ['投掷', '积分', '沙包'] },
        { name: '🤸 体操动作组合', type: '体操', desc: '前滚翻→燕式平衡→侧手翻等动作串联，学生自主创编组合动作。', tags: ['体操', '创编', '平衡'] },
        { name: '⚽ 足球射门大比拼', type: '球类', desc: '设置不同大小的球门和距离，学生轮流射门，按难度积分。', tags: ['足球', '射门', '积分'] },
        { name: '🏃 障碍跑闯关', type: '跑动', desc: '设置跨栏、钻圈、平衡木、跳箱等障碍，计时闯关。', tags: ['障碍', '计时', '综合'] },
        { name: '🤝 两人三足竞速', type: '协作', desc: '两人一组绑腿协调行走/跑动，培养配合能力。', tags: ['协作', '趣味', '两人'] },
        { name: '🎵 节奏拍球操', type: '球类', desc: '跟随音乐节奏进行各种拍球动作，培养节奏感和控球能力。', tags: ['音乐', '节奏', '控球'] },
        { name: '🎪 动物模仿接力', type: '趣味', desc: '模仿不同动物行进方式（蛙跳、兔跳、熊爬等）进行接力比赛。', tags: ['模仿', '趣味', '低年级'] },
    ];
    
    document.getElementById('cardModalBody').innerHTML = games.map(g => `
        <div class="game-item">
            <h4>${g.name}</h4>
            <p>${g.desc}</p>
            <div class="tag-row">${g.tags.map(t => `<span class="tag">${t}</span>`).join('')}</div>
        </div>
    `).join('');
    openModal('cardModal');
}

// ===== Safety Education Modal =====
function openSafetyEduModal() {
    document.getElementById('cardModalTitle').textContent = '运动安全科普素材';
    
    const items = [
        { title: '🔥 运动前热身的重要性', content: '热身能提高肌肉温度和弹性，增加关节活动范围，预防运动损伤。建议热身5-8分钟，包括慢跑、动态拉伸、关节活动等。' },
        { title: '💧 运动中如何正确补水', content: '运动前30分钟可饮水200ml；运动中每15-20分钟少量饮水（50-100ml）；运动后不可大量猛饮，应少量多次补充。避免饮用冰水。' },
        { title: '🦵 预防膝盖损伤要点', content: '运动时注意膝盖方向与脚尖一致，避免膝盖内扣；落地时屈膝缓冲；加强股四头肌和腘绳肌力量训练；使用合适的运动鞋。' },
        { title: '🌡️ 高温天气运动注意事项', content: '气温超过32°C时减少户外剧烈运动；避开11:00-15:00时段；穿着透气浅色服装；关注学生面色和出汗情况，出现不适立即停止。' },
        { title: '🍎 运动与营养搭配', content: '运动前1-2小时可进食少量碳水（如面包、香蕉）；运动后30分钟内补充蛋白质和碳水；避免空腹运动和饱腹运动。' },
        { title: '😴 运动后恢复与休息', content: '运动后进行5-10分钟放松拉伸；保证充足睡眠（小学生9-10小时）；交替进行不同肌群训练，避免同一部位连续高强度训练。' },
        { title: '⚠️ 常见运动损伤识别', content: '扭伤：关节肿胀疼痛；拉伤：肌肉疼痛僵硬；擦伤：皮肤破损出血；如有持续疼痛、肿胀加重、活动受限，应及时就医。' },
        { title: '👟 运动装备选择指南', content: '选择合脚的运动鞋（鞋头留1cm空间）；穿透气吸汗的运动袜；运动服选择弹性好、透气的面料；摘除项链、手表等饰品。' },
    ];
    
    document.getElementById('cardModalBody').innerHTML = items.map(item => `
        <div class="edu-item">
            <h4>${item.title}</h4>
            <p>${item.content}</p>
        </div>
    `).join('');
    openModal('cardModal');
}

// ===== Gallery Modal =====
function openGalleryModal() {
    document.getElementById('cardModalTitle').textContent = '学生运动风采素材生成';
    
    const templates = [
        { title: '🏆 运动表彰语', items: [
            '赛场上的你，是奔跑的闪电！每一次冲刺都展现着拼搏的力量。',
            '跳绳翻飞如蝶舞，百次跳跃见证你的坚持与毅力！',
            '柔韧如弓，你的每一次伸展都在突破自我极限。',
            '力量与速度并存，你是操场上最闪亮的运动之星！',
            '从不放弃每一次尝试，你的进步有目共睹，继续加油！',
        ]},
        { title: '💬 运动格言', items: [
            '生命在于运动，健康源于坚持。',
            '每天运动一小时，健康生活一辈子。',
            '汗水是脂肪的眼泪，坚持是成功的钥匙。',
            '超越昨天的自己，就是最大的胜利。',
            '运动让身体更强壮，坚持让意志更坚定。',
        ]},
        { title: '📝 课堂评语模板', items: [
            '该生在体育课上积极投入，{项目}成绩{等级}，体能发展{评价}，建议{建议}。',
            '本学期该生体测成绩：50米跑{run50}秒、跳绳{skipRope}次、体前屈{sitReach}cm、仰卧起坐{sitUps}次，整体水平{level}。',
            '该生在课堂中展现出良好的运动能力和团队精神，{优势项目}表现突出，{薄弱项目}有待加强。',
        ]},
        { title: '🎨 班级运动口号', items: [
            '强体魄，健身心，阳光少年向前行！',
            '快乐运动，健康成长，四年级X班最闪亮！',
            '跑跳投掷样样行，运动场上我最赢！',
            '每天锻炼一小时，健康快乐伴一生！',
        ]},
    ];
    
    document.getElementById('cardModalBody').innerHTML = templates.map(t => `
        <div class="detail-section">
            <h4>${t.title}</h4>
            ${t.items.map(item => `<div class="gallery-item"><p>${item}</p></div>`).join('')}
        </div>
    `).join('') + `
        <div class="detail-section">
            <h4>💡 使用说明</h4>
            <div class="detail-content">
                课堂评语模板中的{项目}、{等级}、{评价}等占位符可根据学生实际体测数据替换。
                点击「体测数据管理」可查看每位学生的详细成绩，结合模板快速生成个性化评语。
            </div>
        </div>
    `;
    openModal('cardModal');
}

// ===== Data Entry =====
let entrySelectedStudent = null;
let entryMode = 'existing'; // 'existing' or 'new'

function openEntryModal() {
    // Populate class selector
    const classSelect = document.getElementById('entryClass');
    classSelect.innerHTML = Object.keys(appData.students).map(cls => 
        `<option value="${cls}" ${cls === appData.currentClass ? 'selected' : ''}>${cls}</option>`
    ).join('');
    
    // Reset form
    document.getElementById('entryStudentSearch').value = '';
    document.getElementById('entryNewName').value = '';
    document.getElementById('entryNewGender').value = '男';
    document.getElementById('entryRun50').value = '';
    document.getElementById('entrySkipRope').value = '';
    document.getElementById('entrySitReach').value = '';
    document.getElementById('entrySitUps').value = '';
    document.getElementById('studentSearchResults').classList.remove('show');
    document.getElementById('selectedStudentHint').style.display = 'none';
    entrySelectedStudent = null;
    entryMode = 'existing';
    
    openModal('entryModal');
    setTimeout(() => document.getElementById('entryStudentSearch').focus(), 300);
}

function onEntryClassChange() {
    document.getElementById('entryStudentSearch').value = '';
    document.getElementById('studentSearchResults').classList.remove('show');
    clearStudentSelection();
}

function onStudentSearch() {
    const search = document.getElementById('entryStudentSearch').value.trim().toLowerCase();
    const cls = document.getElementById('entryClass').value;
    const students = appData.students[cls] || [];
    const results = document.getElementById('studentSearchResults');
    
    if (search.length === 0) {
        results.classList.remove('show');
        return;
    }
    
    const filtered = students.filter(s => s.name.toLowerCase().includes(search));
    
    if (filtered.length === 0) {
        results.innerHTML = '<div style="padding:12px;color:var(--gray-500);font-size:13px;">未找到匹配学生，请在下方新增</div>';
        results.classList.add('show');
        return;
    }
    
    // Clear "new student" if user is searching for existing
    document.getElementById('entryNewName').value = '';
    
    results.innerHTML = filtered.map(s => {
        const level = getOverallLevel(s);
        return `
            <div class="student-search-result" onclick="selectExistingStudent('${cls}', ${s.no})">
                <span class="sname">${s.name}</span>
                <span class="badge ${s.gender === '男' ? 'badge-male' : 'badge-female'}">${s.gender}</span>
                <span style="margin-left:auto"><span class="badge badge-${level}">${LEVEL_LABELS[level]}</span></span>
            </div>
        `;
    }).join('');
    results.classList.add('show');
    
    // Close search results when clicking outside
    setTimeout(() => {
        document.addEventListener('click', closeSearchResults);
    }, 100);
}

function closeSearchResults(e) {
    if (!e.target.closest('.student-search-wrap')) {
        document.getElementById('studentSearchResults').classList.remove('show');
        document.removeEventListener('click', closeSearchResults);
    }
}

function selectExistingStudent(cls, no) {
    const student = appData.students[cls]?.find(s => s.no == no);
    if (!student) return;
    
    entrySelectedStudent = { cls, no, student };
    entryMode = 'existing';
    
    // Update UI
    document.getElementById('entryStudentSearch').value = `${student.name}（${student.gender}）`;
    document.getElementById('studentSearchResults').classList.remove('show');
    document.getElementById('entryNewName').value = '';
    
    // Show hint
    const hint = document.getElementById('selectedStudentHint');
    const items = getActiveItems(student.grade);
    const levels = items.map(i => {
        const level = getScoreLevel(i, student[i], student.gender, student.grade);
        const val = student[i] !== null && student[i] !== undefined ? student[i] : '未测';
        return `${TEST_ITEMS[i].name}: ${val}${TEST_ITEMS[i].unit}（${LEVEL_LABELS[level]}）`;
    });
    hint.innerHTML = `✅ 已选择：<strong>${student.name}</strong>（${student.gender}）<br><span style="font-weight:400;font-size:11px;">当前成绩：${levels.join(' | ')}</span>`;
    hint.style.display = 'block';
    
    // Pre-fill existing scores as placeholders
    document.getElementById('entryRun50').placeholder = student.run50 !== null && student.run50 !== undefined ? student.run50 : '';
    document.getElementById('entrySkipRope').placeholder = student.skipRope !== null && student.skipRope !== undefined ? student.skipRope : '';
    document.getElementById('entrySitReach').placeholder = student.sitReach !== null && student.sitReach !== undefined ? student.sitReach : '';
    document.getElementById('entrySitUps').placeholder = student.sitUps !== null && student.sitUps !== undefined ? student.sitUps : '';
    
    // Don't clear the score inputs - they already have the new values the teacher entered
}

function onNewStudentInput() {
    const name = document.getElementById('entryNewName').value.trim();
    if (name) {
        clearStudentSelection();
        entryMode = 'new';
        document.getElementById('entryStudentSearch').value = '';
        document.getElementById('studentSearchResults').classList.remove('show');
        document.getElementById('selectedStudentHint').style.display = 'none';
    }
}

function clearStudentSelection() {
    entrySelectedStudent = null;
    entryMode = 'existing';
    document.getElementById('selectedStudentHint').style.display = 'none';
    ['entryRun50', 'entrySkipRope', 'entrySitReach', 'entrySitUps'].forEach(id => {
        document.getElementById(id).placeholder = '';
    });
}

function saveEntryData(e) {
    e.preventDefault();
    
    const cls = document.getElementById('entryClass').value;
    const newName = document.getElementById('entryNewName').value.trim();
    const newGender = document.getElementById('entryNewGender').value;
    
    // Determine target student
    let targetStudent, targetIndex;
    
    if (entryMode === 'new' && newName) {
        // Check for duplicate name
        const students = appData.students[cls] || [];
        const duplicate = students.find(s => s.name === newName);
        if (duplicate) {
            showToast(`「${newName}」已存在，请通过搜索选择`, 'error');
            return;
        }
        
        // Create new student
        const maxNo = students.reduce((max, s) => Math.max(max, s.no || 0), 0);
        targetStudent = {
            no: maxNo + 1,
            name: newName,
            gender: newGender,
            height: null,
            weight: null,
            lung: null,
            run50: null,
            skipRope: null,
            sitReach: null,
            sitUps: null,
        };
        
        if (!appData.students[cls]) appData.students[cls] = [];
        appData.students[cls].push(targetStudent);
        targetIndex = appData.students[cls].length - 1;
        
    } else if (entryMode === 'existing' && entrySelectedStudent) {
        targetStudent = entrySelectedStudent.student;
        const students = appData.students[cls] || [];
        targetIndex = students.findIndex(s => s.no === entrySelectedStudent.no);
    } else {
        showToast('请选择已有学生或输入新学生姓名', 'error');
        return;
    }
    
    // Read scores
    const run50 = parseNum(document.getElementById('entryRun50').value);
    const skipRope = parseNum(document.getElementById('entrySkipRope').value);
    const sitReach = parseNum(document.getElementById('entrySitReach').value);
    const sitUps = parseNum(document.getElementById('entrySitUps').value);
    
    // Validate: at least one score must be entered
    if (run50 === null && skipRope === null && sitReach === null && sitUps === null) {
        showToast('请至少输入一项体测成绩', 'error');
        return;
    }
    
    // Archive current scores before updating (works for both new and existing students)
    archiveCurrentScores(targetStudent);
    
    // Update student data with new scores
    if (run50 !== null) targetStudent.run50 = run50;
    if (skipRope !== null) targetStudent.skipRope = skipRope;
    if (sitReach !== null) targetStudent.sitReach = sitReach;
    if (sitUps !== null) targetStudent.sitUps = sitUps;
    
    // Save
    saveAppData();
    
    // Refresh UI if on relevant pages
    if (document.getElementById('page-roster').classList.contains('active')) renderRoster();
    if (document.getElementById('page-analysis').classList.contains('active')) renderAnalysis();
    
    const studentName = targetStudent.name;
    const scoreCount = [run50, skipRope, sitReach, sitUps].filter(v => v !== null).length;
    showToast(`✅ ${studentName} 的 ${scoreCount} 项成绩已保存`, 'success');
    
    // Close modal
    closeModal('entryModal');
}

// ===== Quick Entry (Pinyin Search + Single Item) =====
let qeSelectedStudent = null;
let qeSelectedProject = null;
let pinyinCache = {}; // name → initials

function getNameInitials(name) {
    if (!name) return '';
    if (pinyinCache[name]) return pinyinCache[name];
    let initials = '';
    try {
        if (typeof pinyinPro !== 'undefined' && pinyinPro.pinyin) {
            initials = pinyinPro.pinyin(name, { pattern: 'first', type: 'array' }).join('');
        }
    } catch(e) { /* fallback below */ }
    if (!initials) {
        // Fallback: first char of each char (for non-Chinese)
        initials = name.toLowerCase();
    }
    pinyinCache[name] = initials;
    return initials;
}

function openQuickEntry() {
    const classSelect = document.getElementById('qeClass');
    classSelect.innerHTML = Object.keys(appData.students).map(cls =>
        `<option value="${cls}" ${cls === appData.currentClass ? 'selected' : ''}>${cls}</option>`
    ).join('');

    // Build project pills
    const projects = ['run50', 'skipRope', 'sitReach', 'sitUps'];
    document.getElementById('qeProjectSelector').innerHTML = projects.map(p =>
        `<div class="qe-pill" data-project="${p}" onclick="selectQeProject('${p}')">${TEST_ITEMS[p].icon} ${TEST_ITEMS[p].name}</div>`
    ).join('');

    // Reset state
    document.getElementById('qeSearch').value = '';
    document.getElementById('qeSearchResults').classList.remove('show');
    document.getElementById('qeEntryPanel').style.display = 'none';
    qeSelectedStudent = null;
    qeSelectedProject = null;
    document.querySelectorAll('.qe-pill').forEach(p => p.classList.remove('active'));

    openModal('quickEntryModal');
    setTimeout(() => document.getElementById('qeSearch').focus(), 300);
}

function onQeClassChange() {
    document.getElementById('qeSearch').value = '';
    document.getElementById('qeSearchResults').classList.remove('show');
    document.getElementById('qeEntryPanel').style.display = 'none';
    qeSelectedStudent = null;
}

function onQeSearch() {
    const search = document.getElementById('qeSearch').value.trim().toLowerCase();
    const cls = document.getElementById('qeClass').value;
    const students = appData.students[cls] || [];
    const results = document.getElementById('qeSearchResults');

    if (search.length === 0) {
        results.classList.remove('show');
        return;
    }

    const filtered = students.filter(s => {
        const nameLower = s.name.toLowerCase();
        const initials = getNameInitials(s.name);
        // Match by name, initials, or partial initials
        return nameLower.includes(search) ||
               initials.includes(search) ||
               initials.startsWith(search);
    });

    if (filtered.length === 0) {
        results.innerHTML = '<div style="padding:12px;color:var(--gray-500);font-size:13px;">未找到匹配学生</div>';
        results.classList.add('show');
        return;
    }

    results.innerHTML = filtered.map(s => {
        const level = getOverallLevel(s);
        const initials = getNameInitials(s.name);
        return `
            <div class="student-search-result" onclick="selectQeStudent('${cls}', ${s.no})">
                <span class="sname">${s.name}</span>
                <span style="font-size:11px;color:var(--gray-400);">${initials}</span>
                <span class="badge ${s.gender === '男' ? 'badge-male' : 'badge-female'}">${s.gender}</span>
                <span style="margin-left:auto"><span class="badge badge-${level}">${LEVEL_LABELS[level]}</span></span>
            </div>
        `;
    }).join('');
    results.classList.add('show');

    setTimeout(() => {
        document.addEventListener('click', closeQeSearchResults);
    }, 100);
}

function closeQeSearchResults(e) {
    if (!e.target.closest('.qe-section .student-search-wrap')) {
        document.getElementById('qeSearchResults').classList.remove('show');
        document.removeEventListener('click', closeQeSearchResults);
    }
}

function selectQeStudent(cls, no) {
    const student = appData.students[cls]?.find(s => s.no == no);
    if (!student) return;

    qeSelectedStudent = { cls, no, student };
    document.getElementById('qeSearch').value = student.name;
    document.getElementById('qeSearchResults').classList.remove('show');
    updateQeEntryPanel();
}

function selectQeProject(project) {
    qeSelectedProject = project;
    document.querySelectorAll('.qe-pill').forEach(p => p.classList.remove('active'));
    document.querySelector(`.qe-pill[data-project="${project}"]`).classList.add('active');
    updateQeEntryPanel();
}

function updateQeEntryPanel() {
    if (!qeSelectedStudent || !qeSelectedProject) {
        document.getElementById('qeEntryPanel').style.display = 'none';
        return;
    }

    const student = qeSelectedStudent.student;
    const project = qeSelectedProject;
    const item = TEST_ITEMS[project];
    const oldVal = student[project];
    const oldLevel = getScoreLevel(project, oldVal, student.gender, student.grade);
    const hasOldVal = oldVal !== null && oldVal !== undefined && oldVal !== '';

    document.getElementById('qeStudentCard').innerHTML = `
        <span class="qe-sname">${student.name}</span>
        <span class="badge ${student.gender === '男' ? 'badge-male' : 'badge-female'}">${student.gender}</span>
        <span class="qe-sinfo">${hasOldVal ? `当前: ${oldVal}${item.unit}（${LEVEL_LABELS[oldLevel]}）` : '暂无记录'}</span>
    `;

    const scoreInput = document.getElementById('qeScoreInput');
    scoreInput.value = '';
    scoreInput.placeholder = `输入${item.name}`;
    scoreInput.step = item.name.includes('跑') || item.name.includes('体前屈') ? '0.1' : '1';
    scoreInput.min = item.name.includes('体前屈') ? '-30' : '0';

    document.getElementById('qeScoreUnit').textContent = item.unit;

    document.getElementById('qeHint').innerHTML = hasOldVal
        ? `<span class="qe-old-score">旧成绩: ${oldVal}${item.unit}（${LEVEL_LABELS[oldLevel]}）</span> — 输入新成绩后保存，旧成绩自动存入历史记录`
        : '输入成绩后按「保存」或回车键提交';

    document.getElementById('qeEntryPanel').style.display = 'block';
    setTimeout(() => scoreInput.focus(), 100);
}

function saveQuickEntry() {
    if (!qeSelectedStudent || !qeSelectedProject) {
        showToast('请先选择学生和录入项目', 'error');
        return;
    }

    const score = parseNum(document.getElementById('qeScoreInput').value);
    if (score === null) {
        showToast('请输入有效成绩', 'error');
        return;
    }

    const student = qeSelectedStudent.student;
    const project = qeSelectedProject;
    const item = TEST_ITEMS[project];
    const oldVal = student[project];
    const hasOldData = oldVal !== null && oldVal !== undefined;

    // Archive current scores before updating
    archiveCurrentScores(student);

    // Update with new score
    student[project] = score;
    saveAppData();

    // Refresh UI
    if (document.getElementById('page-roster').classList.contains('active')) renderRoster();
    if (document.getElementById('page-analysis').classList.contains('active')) renderAnalysis();

    // Show success feedback
    const newLevel = getScoreLevel(project, score, student.gender, student.grade);
    const oldLevel = hasOldData ? getScoreLevel(project, oldVal, student.gender, student.grade) : 'none';
    const lowerIsBetter = item.lowerIsBetter;
    let changeText = '';
    if (hasOldData && oldVal !== score) {
        const improved = lowerIsBetter ? score < oldVal : score > oldVal;
        const diff = Math.abs(score - oldVal).toFixed(1);
        changeText = improved
            ? ` <span style="color:#4CAF50;font-weight:700;">↑${diff} 进步！</span>`
            : ` <span style="color:#f44336;font-weight:700;">↓${diff} 需努力</span>`;
    }

    showToast(`✅ ${student.name} ${item.name}: ${score}${item.unit}（${LEVEL_LABELS[newLevel]}）${changeText}`, 'success');

    // Reset for next student
    document.getElementById('qeSearch').value = '';
    document.getElementById('qeEntryPanel').style.display = 'none';
    qeSelectedStudent = null;
    // Keep project selected for rapid entry
    setTimeout(() => document.getElementById('qeSearch').focus(), 200);
}

function exportRoster() {
    const cls = appData.currentClass;
    const grade = gradeOfClass(cls);
    const items = getActiveItems(grade);
    const students = appData.students[cls] || [];

    const header = ['序号', '姓名', '性别', '身高(cm)', '体重(kg)', '肺活量(ml)']
        .concat(items.map(i => TEST_ITEMS[i].name + (TEST_ITEMS[i].unit ? '(' + TEST_ITEMS[i].unit + ')' : '')))
        .concat(['总分', '等级']);
    const wsData = [header];

    students.forEach(s => {
        const ov = getOverallScore(s);
        const row = [s.no, s.name, s.gender, s.height, s.weight, s.lung];
        items.forEach(i => row.push(i === 'bmi' ? (calcBmi(s) ?? '') : (s[i] ?? '')));
        row.push(s.excused ? '免测' : (ov.total != null ? ov.total : ''));
        row.push(s.excused ? '免测' : LEVEL_LABELS[ov.level]);
        wsData.push(row);
    });

    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, cls);
    XLSX.writeFile(wb, `${cls}_花名册_${new Date().toLocaleDateString()}.xlsx`);
    showToast('花名册已导出', 'success');
}

// ===== Student Management Page =====
function renderStudentMgmt() {
    const select = document.getElementById('deleteClassSelect');
    if (!select) return;
    const classes = Object.keys(appData.students);
    select.innerHTML = classes.map(c => `<option value="${c}">${c}</option>`).join('');
    if (classes.length === 0) {
        select.innerHTML = '<option value="">（暂无班级数据）</option>';
    }
    const bk = document.getElementById('backupArea');
    if (bk) bk.style.display = classes.length ? 'flex' : 'none';
}

// 导入新数据：复用侧边栏已有的文件选择框
function triggerImport() {
    const input = document.getElementById('excelImport');
    if (input) input.click();
}

// 模板下载：生成含表头的 Excel 空模板
// 模板下载：生成含「班级」列的国家体测网格式空模板
function downloadTemplate() {
    const classes = Object.keys(appData.students);
    const header = ['年级编号', '班级编号', '班级名称', '学籍号', '姓名', '性别', '出生日期', '身高(cm)', '体重(kg)', '肺活量(ml)', '50米跑(秒)', '坐位体前屈(cm)', '一分钟跳绳(次)', '一分钟仰卧起坐(次)', '50米×8往返跑(秒)'];
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([header]);
    // 示例行：班级与姓名填写即可，分数留空；性别用 1=男 / 2=女
    const sampleCls = classes.length ? classes[0] : '小学2024级1班';
    const examples = [
        ['12', '2024101', sampleCls, '', '张三', '1', '2016-09-01', '', '', '', '', '', '', '', ''],
        ['12', '2024101', sampleCls, '', '李四', '2', '2016-10-12', '', '', '', '', '', '', '', ''],
    ];
    XLSX.utils.sheet_add_aoa(ws, examples, { origin: 'A2' });
    ws['!cols'] = header.map(h => ({ wch: Math.max(8, h.length * 2) }));
    XLSX.utils.book_append_sheet(wb, ws, '体测录入模板');
    XLSX.writeFile(wb, `学生体测录入模板_${new Date().toLocaleDateString()}.xlsx`);
    showToast('模板已下载（含「班级名称/班级编号」列），填写后可通过「导入新数据」上传', 'success');
}

// 删除班级全部数据
function deleteClassData(e) {
    e.stopPropagation();
    const select = document.getElementById('deleteClassSelect');
    const cls = select ? select.value : '';
    if (!cls || !appData.students[cls]) {
        showToast('请先选择一个有效班级', 'error');
        return;
    }
    const count = (appData.students[cls] || []).length;
    const confirm1 = window.confirm(`确定要删除【${cls}】的全部数据吗？\n该班级共 ${count} 名学生，所有体测成绩与历史记录将被永久删除，无法恢复！`);
    if (!confirm1) return;
    const confirm2 = window.confirm(`再次确认：删除【${cls}】全部数据？此操作不可撤销。`);
    if (!confirm2) return;

    delete appData.students[cls];

    // 若删除了当前班级，切换到剩余第一个班级
    if (appData.currentClass === cls) {
        const remaining = Object.keys(appData.students);
        appData.currentClass = remaining.length > 0 ? remaining[0] : '';
    }
    saveAppData();

    // 刷新所有相关模块
    initRoster();
    initAnalysis();
    initHomeStats();
    renderRoster();
    renderStudentMgmt();

    showToast(`已删除【${cls}】全部数据`, 'success');
}

// ===== Excel Import =====
function initExcelImport() {
    document.getElementById('excelImport').addEventListener('change', handleExcelImport);
}

function handleExcelImport(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
        try {
            const data = new Uint8Array(ev.target.result);
            const wb = XLSX.read(data, { type: 'array' });

            const newStudents = {};   // className -> [students]

            wb.SheetNames.forEach(sheetName => {
                const ws = wb.Sheets[sheetName];
                const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });
                if (rows.length < 2) return;
                const colMap = parseHeaderRow(rows[0]);
                if (colMap.name == null) return;

                for (let i = 1; i < rows.length; i++) {
                    const row = rows[i];
                    const name = (row[colMap.name] != null) ? String(row[colMap.name]).trim() : '';
                    if (!name) continue;

                    // 班级：优先 班级名称 → 班级编号 → 班级；都没有则退回工作表名（避免全班塞进一个班级）
                    let cls = null;
                    if (colMap.className != null && row[colMap.className] != null && String(row[colMap.className]).trim() !== '') cls = String(row[colMap.className]).trim();
                    else if (colMap.classNo != null && row[colMap.classNo] != null && String(row[colMap.classNo]).trim() !== '') cls = String(row[colMap.classNo]).trim();
                    else if (colMap.classCol != null && row[colMap.classCol] != null && String(row[colMap.classCol]).trim() !== '') cls = String(row[colMap.classCol]).trim();
                    if (!cls) cls = sheetName;

                    // 年级：优先按班级名中的入学年届推算（2026-09 当前学年）；无届则回退 年级编号
                    let grade = currentGradeFromClass(cls);
                    if (grade == null) grade = gradeFromNo(colMap.gradeNo != null ? row[colMap.gradeNo] : '');
                    // 已升高中（年级 > 9）或无效 → 跳过，不录入
                    if (grade == null || grade < 1 || grade > 9) continue;

                    if (!newStudents[cls]) newStudents[cls] = [];
                    const st = {
                        no: newStudents[cls].length + 1,
                        name,
                        gender: mapGender(colMap.gender != null ? row[colMap.gender] : ''),
                        grade: grade,
                        height: parseNum(colMap.height != null ? row[colMap.height] : ''),
                        weight: parseNum(colMap.weight != null ? row[colMap.weight] : ''),
                        lung: colMap.lung != null ? parseNum(row[colMap.lung]) : null,
                        run50: parseNum(colMap.run50 != null ? row[colMap.run50] : ''),
                        sitReach: parseNum(colMap.sitReach != null ? row[colMap.sitReach] : ''),
                        skipRope: parseNum(colMap.skipRope != null ? row[colMap.skipRope] : ''),
                        sitUps: parseNum(colMap.sitUps != null ? row[colMap.sitUps] : ''),
                        run50x8: colMap.run50x8 != null ? parseNum(row[colMap.run50x8]) : null,
                        sid: colMap.sid != null ? String(row[colMap.sid] ?? '').trim() : '',
                        birth: colMap.birth != null ? excelDateToStr(row[colMap.birth]) : '',
                    };
                    newStudents[cls].push(st);
                }
            });

            if (Object.keys(newStudents).length === 0) {
                showToast('未找到有效数据，请检查Excel格式（需含姓名列）', 'error');
                return;
            }

            // 合并：保留已有成绩与历史记录
            const now = new Date();
            const dateStr = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
            const SCORE_FIELDS = ['run50', 'skipRope', 'sitReach', 'sitUps', 'lung', 'height', 'weight', 'run50x8'];

            Object.keys(newStudents).forEach(cls => {
                if (!appData.students[cls]) { appData.students[cls] = newStudents[cls]; return; }
                const existing = appData.students[cls];
                newStudents[cls].forEach(ns => {
                    const idx = existing.findIndex(s => s.name === ns.name);
                    if (idx >= 0) {
                        const old = existing[idx];
                        const hasOld = SCORE_FIELDS.some(k => old[k] != null && old[k] !== '');
                        if (hasOld) {
                            if (!old.history) old.history = [];
                            const hasNew = SCORE_FIELDS.some(k => ns[k] != null && ns[k] !== '');
                            const last = old.history[old.history.length - 1];
                            if (hasNew && (!last || last.date !== dateStr)) {
                                old.history.push({
                                    date: dateStr,
                                    run50: old.run50 ?? null, skipRope: old.skipRope ?? null, sitReach: old.sitReach ?? null,
                                    sitUps: old.sitUps ?? null, lung: old.lung ?? null, height: old.height ?? null,
                                    weight: old.weight ?? null, run50x8: old.run50x8 ?? null,
                                });
                            }
                        }
                        ['height', 'weight', 'run50', 'skipRope', 'sitReach', 'sitUps', 'lung', 'run50x8', 'gender', 'grade', 'sid', 'birth'].forEach(k => {
                            if (ns[k] != null && ns[k] !== '') old[k] = ns[k];
                        });
                    } else {
                        existing.push(ns);
                    }
                });
            });

            saveAppData();
            initRoster(); initAnalysis(); initHomeStats(); renderRoster();

            const total = Object.values(newStudents).reduce((a, l) => a + l.length, 0);
            const clsN = Object.keys(newStudents).length;
            showToast(`✅ 成功导入 ${clsN} 个班级共 ${total} 名学生（已按「班级」列自动分组，避免混淆）`, 'success');
        } catch (err) {
            console.error(err);
            showToast('导入失败：' + err.message, 'error');
        }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
}

function parseHeaderRow(header) {
    const map = {};
    header.forEach((h, i) => {
        if (h == null) return;
        const s = String(h).trim().replace(/\r?\n/g, '');
        if (s.includes('班级名称')) map.className = i;
        else if (s.includes('班级编号')) map.classNo = i;
        else if (s === '班级' || (s.includes('班级') && !map.classCol && map.className == null)) map.classCol = i;
        else if (s.includes('学籍号') || s.includes('学号')) map.sid = i;
        else if (s.includes('年级编号')) map.gradeNo = i;
        else if (s.includes('出生日期') || s.includes('出生') || s.includes('生日')) map.birth = i;
        else if (s.includes('序号') || (s.includes('编号') && s.includes('学'))) map.no = i;
        else if (s.includes('姓名') || s.includes('名字')) map.name = i;
        else if (s.includes('身高')) map.height = i;
        else if (s.includes('体重')) map.weight = i;
        else if (s.includes('肺活量')) map.lung = i;
        else if (s.includes('50米') || s.includes('五十米')) map.run50 = i;
        else if (s.includes('体前屈')) map.sitReach = i;
        else if (s.includes('跳绳')) map.skipRope = i;
        else if (s.includes('仰卧') || s.includes('起坐')) map.sitUps = i;
        else if (s.includes('50×8') || s.includes('折返')) map.run50x8 = i;
        else if (s.includes('性别')) map.gender = i;
    });
    if (map.name == null) {
        // 兜底：没有“姓名”列时，默认取第 2 列（序号之后通常是姓名）
        if (header.length > 1) map.name = 1;
    }
    return map;
}

function parseNum(val) {
    if (val === null || val === undefined || val === '') return null;
    const num = parseFloat(val);
    return isNaN(num) ? null : num;
}
