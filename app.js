// ===== Global State =====
let appData = { students: {}, currentClass: null, charts: {} };

// ===== Init =====
document.addEventListener('DOMContentLoaded', () => {
    // Load data from localStorage or use default
    loadAppData();
    initNavigation();
    initMobileNav();
    initHomeStats();
    initRoster();
    initAnalysis();
    initLessons();
    initSafety();
    initExcelImport();
    initHomeCards();
});

// ===== Data Management =====
function loadAppData() {
    const saved = localStorage.getItem('pe_workbench_data');
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            appData.students = parsed.students || {};
            appData.currentClass = parsed.currentClass || Object.keys(appData.students)[0];
        } catch(e) {
            appData.students = JSON.parse(JSON.stringify(STUDENT_DATA));
            appData.currentClass = Object.keys(appData.students)[0];
        }
    } else {
        appData.students = JSON.parse(JSON.stringify(STUDENT_DATA));
        appData.currentClass = Object.keys(appData.students)[0];
    }
}

function saveAppData() {
    localStorage.setItem('pe_workbench_data', JSON.stringify({
        students: appData.students,
        currentClass: appData.currentClass,
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
    const pageNames = { home: '工作台首页', roster: '学生花名册', analysis: '体测数据管理', lessons: '备课教案库', safety: '安全应急预案' };
    
    // Update sidebar
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    const sidebarItem = document.querySelector(`.nav-item[data-page="${page}"]`);
    if (sidebarItem) sidebarItem.classList.add('active');
    
    // Update pages
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    const pageEl = document.getElementById('page-' + page);
    if (pageEl) pageEl.classList.add('active');
    
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
    if (page === 'lessons') renderLessons();
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

// ===== Score Calculation =====
function getScoreLevel(item, value, gender) {
    if (value === null || value === undefined || value === '' || isNaN(value)) return 'none';
    const std = SCORE_STANDARDS[item];
    if (!std || !std[gender]) return 'none';
    const s = std[gender];
    const lowerIsBetter = TEST_ITEMS[item]?.lowerIsBetter;
    
    if (lowerIsBetter) {
        if (value <= s.优秀) return 'excellent';
        if (value <= s.良好) return 'good';
        if (value <= s.及格) return 'pass';
        return 'weak';
    } else {
        if (value >= s.优秀) return 'excellent';
        if (value >= s.良好) return 'good';
        if (value >= s.及格) return 'pass';
        return 'weak';
    }
}

function getOverallLevel(student) {
    const items = ['run50', 'skipRope', 'sitReach', 'sitUps'];
    const levels = items.map(i => getScoreLevel(i, student[i], student.gender)).filter(l => l !== 'none');
    if (levels.length === 0) return 'none';
    if (levels.every(l => l === 'excellent')) return 'excellent';
    if (levels.every(l => l === 'excellent' || l === 'good')) return 'good';
    if (levels.some(l => l === 'weak')) return 'weak';
    return 'pass';
}

const LEVEL_LABELS = { excellent: '优秀', good: '良好', pass: '及格', weak: '薄弱', none: '未测' };
const LEVEL_COLORS = { excellent: '#4CAF50', good: '#2196F3', pass: '#FF9800', weak: '#f44336', none: '#9E9E9E' };

// ===== Home Stats =====
function initHomeStats() {
    const totalStudents = Object.values(appData.students).reduce((sum, list) => sum + list.length, 0);
    const totalClasses = Object.keys(appData.students).length;
    const totalLessons = Object.values(LESSON_PLANS).reduce((sum, d) => sum + d.totalCount, 0);
    
    document.getElementById('homeStats').innerHTML = `
        <div class="header-stat">📊 ${totalClasses}个班级</div>
        <div class="header-stat">👥 <span class="stat-val">${totalStudents}</span> 名学生</div>
        <div class="header-stat">📚 ${totalLessons} 篇教案</div>
    `;
}

// ===== Home Cards =====
function initHomeCards() {
    const routineCards = [
        { id: 'roster', icon: '👥', title: '学生花名册管理', desc: '批量导入/手动录入学生信息，关联体测历史、课堂表现、体能短板标记', tag: '花名册+体测', color: '#4CAF50', bg: '#E8F5E9' },
        { id: 'analysis', icon: '📊', title: '体测成绩分析表', desc: '自动同步花名册体测数据，生成班级统计、个人趋势、薄弱预警', tag: '自动同步', color: '#42A5F5', bg: '#E3F2FD' },
        { id: 'lessons', icon: '📚', title: '体育课备课教案', desc: '水平一/二/三教案库，含教学目标、重难点、教学过程', tag: '70篇教案', color: '#FFA726', bg: '#FFF3E0' },
        { id: 'safety', icon: '🛡️', title: '课堂安全与应急预案', desc: '运动损伤处理流程、突发事件应急方案、安全检查清单', tag: '安全第一', color: '#EF5350', bg: '#FFEBEE' },
        { id: 'tracking', icon: '📈', title: '学生体能学情跟踪', desc: '跟踪学生体能发展轨迹，识别进步与退步趋势', tag: '成长追踪', color: '#AB47BC', bg: '#F3E5F5' },
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
    const navMap = { roster: 'roster', analysis: 'analysis', lessons: 'lessons', safety: 'safety' };
    if (navMap[id]) {
        document.querySelector(`.nav-item[data-page="${navMap[id]}"]`).click();
        return;
    }
    
    if (id === 'tracking') openTrackingModal();
    if (id === 'games') openGamesModal();
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
    
    document.getElementById('rosterSummary').innerHTML = `
        <div class="summary-item"><div class="sum-val">${filtered.length}</div><div class="sum-label">总人数</div></div>
        <div class="summary-item"><div class="sum-val" style="color:#42A5F5">${maleCount}</div><div class="sum-label">男生</div></div>
        <div class="summary-item"><div class="sum-val" style="color:#EC407A">${femaleCount}</div><div class="sum-label">女生</div></div>
        <div class="summary-item"><div class="sum-val" style="color:#4CAF50">${excellent}</div><div class="sum-label">体能优秀</div></div>
        <div class="summary-item"><div class="sum-val" style="color:#f44336">${weak}</div><div class="sum-label">体能薄弱</div></div>
    `;
    
    // Table
    const table = document.getElementById('rosterTable');
    table.innerHTML = `
        <thead>
            <tr>
                <th>序号</th><th>姓名</th><th>性别</th><th>身高(cm)</th><th>体重(kg)</th>
                <th>50米跑(秒)</th><th>跳绳(次)</th><th>体前屈(cm)</th><th>仰卧起坐(次)</th>
                <th>体能水平</th>
            </tr>
        </thead>
        <tbody>
            ${filtered.map(s => {
                const level = getOverallLevel(s);
                return `<tr>
                    <td data-label="序号">${s.no || ''}</td>
                    <td class="name-cell" data-label="姓名" onclick="showStudentDetail('${cls}', ${s.no})">${s.name}</td>
                    <td data-label="性别"><span class="badge ${s.gender === '男' ? 'badge-male' : 'badge-female'}">${s.gender}</span></td>
                    <td data-label="身高">${s.height ?? '-'} cm</td>
                    <td data-label="体重">${s.weight ?? '-'} kg</td>
                    <td data-label="50米跑">${s.run50 ?? '-'} 秒</td>
                    <td data-label="跳绳">${s.skipRope ?? '-'} 次</td>
                    <td data-label="体前屈">${s.sitReach ?? '-'} cm</td>
                    <td data-label="仰卧起坐">${s.sitUps ?? '-'} 次</td>
                    <td data-label="体能水平"><span class="badge badge-${level}">${LEVEL_LABELS[level]}</span></td>
                </tr>`;
            }).join('')}
        </tbody>
    `;
}

function showStudentDetail(cls, no) {
    const student = appData.students[cls]?.find(s => s.no == no);
    if (!student) return;
    
    document.getElementById('modalStudentName').textContent = `${student.name} - ${cls}`;
    
    const items = ['run50', 'skipRope', 'sitReach', 'sitUps'];
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
                const level = getScoreLevel(item, student[item], student.gender);
                const std = SCORE_STANDARDS[item]?.[student.gender];
                const lowerIsBetter = TEST_ITEMS[item]?.lowerIsBetter;
                const val = student[item];
                
                // Calculate percentage for bar
                let pct = 0;
                if (val !== null && val !== undefined && val !== '' && !isNaN(val) && std) {
                    if (lowerIsBetter) {
                        // For time-based items, lower is better
                        pct = Math.max(10, Math.min(100, ((std.及格 - val) / (std.及格 - std.满分)) * 60 + 40));
                    } else {
                        pct = Math.max(10, Math.min(100, ((val - std.及格) / (std.满分 - std.及格)) * 60 + 40));
                    }
                    pct = Math.max(10, Math.min(100, pct));
                }
                
                return `
                    <div class="score-bar">
                        <div class="score-bar-header">
                            <span class="score-bar-label">${TEST_ITEMS[item].icon} ${TEST_ITEMS[item].name}</span>
                            <span class="score-bar-value">${val ?? '未测'} ${TEST_ITEMS[item].unit} <span class="badge badge-${level}" style="margin-left:8px">${LEVEL_LABELS[level]}</span></span>
                        </div>
                        <div class="score-bar-track">
                            <div class="score-bar-fill" style="width:${pct}%; background:${LEVEL_COLORS[level]}"></div>
                        </div>
                        ${std ? `<div style="font-size:11px;color:var(--gray-400);margin-top:4px;">标准：优秀 ${lowerIsBetter ? '≤' : '≥'}${std.优秀} | 良好 ${lowerIsBetter ? '≤' : '≥'}${std.良好} | 及格 ${lowerIsBetter ? '≤' : '≥'}${std.及格} | 满分 ${std.满分}</div>` : ''}
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
    `;
    
    document.getElementById('modalStudentBody').innerHTML = body;
    openModal('studentModal');
}

function getWeaknessAnalysis(student) {
    const items = ['run50', 'skipRope', 'sitReach', 'sitUps'];
    const weaknesses = items.filter(i => getScoreLevel(i, student[i], student.gender) === 'weak');
    const strengths = items.filter(i => getScoreLevel(i, student[i], student.gender) === 'excellent');
    
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
    // Check if student has any existing scores worth archiving
    const hasAnyScore = student.run50 != null || student.skipRope != null ||
                        student.sitReach != null || student.sitUps != null;
    if (!hasAnyScore) return;
    
    if (!student.history) student.history = [];
    
    const now = new Date();
    const dateStr = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
    
    const currentScores = {
        date: dateStr,
        run50: student.run50 ?? null,
        skipRope: student.skipRope ?? null,
        sitReach: student.sitReach ?? null,
        sitUps: student.sitUps ?? null,
    };
    
    // If last entry is from today with same scores, skip duplicate
    const last = student.history[student.history.length - 1];
    if (last && last.date === dateStr &&
        last.run50 === currentScores.run50 &&
        last.skipRope === currentScores.skipRope &&
        last.sitReach === currentScores.sitReach &&
        last.sitUps === currentScores.sitUps) {
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
    const items = ['run50', 'skipRope', 'sitReach', 'sitUps'];
    const history = student.history || [];
    
    // Collect all records
    const allRecs = [...history];
    allRecs.push({
        date: '当前',
        run50: student.run50 ?? null,
        skipRope: student.skipRope ?? null,
        sitReach: student.sitReach ?? null,
        sitUps: student.sitUps ?? null,
    });
    
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
            const level = getScoreLevel(item, bestVal, student.gender);
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
    const items = ['run50', 'skipRope', 'sitReach', 'sitUps'];
    const history = student.history || [];
    
    // Build all records (history + current)
    const allRecords = [...history];
    const now = new Date();
    const dateStr = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
    allRecords.push({
        date: dateStr,
        run50: student.run50,
        skipRope: student.skipRope,
        sitReach: student.sitReach,
        sitUps: student.sitUps,
    });
    
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
            const level = getScoreLevel(item, val, student.gender);
            
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
    
    // Project selector
    const projects = ['run50', 'skipRope', 'sitReach', 'sitUps'];
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
    
    document.getElementById('overviewStats').innerHTML = `
        <div class="stat-card" style="--card-color:#4CAF50"><div class="stat-label">班级总人数</div><div class="stat-value">${total}</div></div>
        <div class="stat-card" style="--card-color:#42A5F5"><div class="stat-label">男生</div><div class="stat-value">${maleCount}</div></div>
        <div class="stat-card" style="--card-color:#EC407A"><div class="stat-label">女生</div><div class="stat-value">${femaleCount}</div></div>
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
        const level = getScoreLevel(item, s[item], s.gender);
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
    
    const items = ['run50', 'skipRope', 'sitReach', 'sitUps'];
    
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
                const level = getScoreLevel(item, student[item], student.gender);
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
    `;
    
    document.getElementById('studentDetail').innerHTML = body;
}

function renderWarnings() {
    const cls = appData.currentClass;
    const students = appData.students[cls] || [];
    const items = ['run50', 'skipRope', 'sitReach', 'sitUps'];
    
    const warnings = [];
    students.forEach(s => {
        const weakItems = items.filter(i => getScoreLevel(i, s[i], s.gender) === 'weak');
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

// ===== Lessons =====
let currentLevel = '水平二';

function initLessons() {
    const levels = Object.keys(LESSON_PLANS);
    document.getElementById('levelTabs').innerHTML = levels.map(l => 
        `<div class="level-tab ${l === currentLevel ? 'active' : ''}" data-level="${l}">${l}</div>`
    ).join('');
    
    document.getElementById('levelTabs').addEventListener('click', e => {
        if (e.target.classList.contains('level-tab')) {
            currentLevel = e.target.dataset.level;
            document.querySelectorAll('.level-tab').forEach(t => t.classList.remove('active'));
            e.target.classList.add('active');
            renderLessons();
        }
    });
    
    document.getElementById('lessonSearch').addEventListener('input', renderLessons);
}

function renderLessons() {
    const search = document.getElementById('lessonSearch').value.trim().toLowerCase();
    const data = LESSON_PLANS[currentLevel];
    if (!data) return;
    
    let plans = data.plans || [];
    if (search) {
        plans = plans.filter(p => 
            p.title.toLowerCase().includes(search) || 
            (p.content || '').toLowerCase().includes(search) ||
            (p.category || '').toLowerCase().includes(search)
        );
    }
    
    const levelColors = { '水平一': '#4CAF50', '水平二': '#2196F3', '水平三': '#FF9800' };
    const levelBgs = { '水平一': '#E8F5E9', '水平二': '#E3F2FD', '水平三': '#FFF3E0' };
    
    if (plans.length === 0) {
        document.getElementById('lessonGrid').innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--gray-500);">未找到匹配的教案</div>';
        return;
    }
    
    document.getElementById('lessonGrid').innerHTML = plans.map(p => `
        <div class="lesson-card" onclick="showLessonDetail('${p.id}')">
            <span class="lesson-level" style="background:${levelBgs[currentLevel]};color:${levelColors[currentLevel]};">${currentLevel}</span>
            ${p.category ? `<div class="lesson-cat">${p.category}</div>` : ''}
            <div class="lesson-title">${p.title}</div>
            <div class="lesson-content">${p.content || '点击查看详细教案内容'}</div>
        </div>
    `).join('');
}

function showLessonDetail(id) {
    const plan = Object.values(LESSON_PLANS).flatMap(d => d.plans).find(p => p.id === id);
    if (!plan) return;
    
    document.getElementById('modalLessonTitle').textContent = plan.title;
    
    const body = `
        ${plan.category ? `<div class="detail-section"><h4>所属分类</h4><div class="detail-content">${plan.category}</div></div>` : ''}
        ${plan.content ? `<div class="detail-section"><h4>📋 教学内容</h4><div class="detail-content">${plan.content}</div></div>` : ''}
        ${plan.goals ? `<div class="detail-section"><h4>🎯 教学目标</h4><div class="detail-content">${plan.goals}</div></div>` : ''}
        ${plan.keyPoint ? `<div class="detail-section"><h4>⭐ 教学重点</h4><div class="detail-content">${plan.keyPoint}</div></div>` : ''}
        ${plan.difficulty ? `<div class="detail-section"><h4>⚡ 教学难点</h4><div class="detail-content">${plan.difficulty}</div></div>` : ''}
        ${plan.processSummary ? `<div class="detail-section"><h4>📝 教学过程</h4><div class="detail-content">${plan.processSummary}</div></div>` : ''}
        ${plan.load ? `<div class="detail-section"><h4>💪 预计负荷</h4><div class="detail-content">${plan.load}</div></div>` : ''}
        ${plan.equipment ? `<div class="detail-section"><h4>🏟️ 场地器材</h4><div class="detail-content">${plan.equipment}</div></div>` : ''}
    `;
    
    document.getElementById('modalLessonBody').innerHTML = body;
    openModal('lessonModal');
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
    const items = ['run50', 'skipRope', 'sitReach', 'sitUps'];
    
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
                const weakItems = items.filter(i => getScoreLevel(i, s[i], s.gender) === 'weak');
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
    const items = ['run50', 'skipRope', 'sitReach', 'sitUps'];
    const levels = items.map(i => {
        const level = getScoreLevel(i, student[i], student.gender);
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
    const oldLevel = getScoreLevel(project, oldVal, student.gender);
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
    const newLevel = getScoreLevel(project, score, student.gender);
    const oldLevel = hasOldData ? getScoreLevel(project, oldVal, student.gender) : 'none';
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
    const students = appData.students[cls] || [];
    
    const wsData = [
        ['序号', '姓名', '性别', '身高(cm)', '体重(kg)', '50米跑(秒)', '1分钟跳绳(次)', '坐位体前屈(cm)', '1分钟仰卧起坐(次)', '体能水平'],
    ];
    
    students.forEach(s => {
        wsData.push([
            s.no, s.name, s.gender, s.height, s.weight,
            s.run50, s.skipRope, s.sitReach, s.sitUps,
            LEVEL_LABELS[getOverallLevel(s)],
        ]);
    });
    
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, cls);
    XLSX.writeFile(wb, `${cls}_花名册_${new Date().toLocaleDateString()}.xlsx`);
    showToast('花名册已导出', 'success');
}

// ===== Excel Import =====
function initExcelImport() {
    document.getElementById('excelImport').addEventListener('change', handleExcelImport);
}

function handleExcelImport(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = new Uint8Array(e.target.result);
            const wb = XLSX.read(data, { type: 'array' });
            
            const newStudents = {};
            wb.SheetNames.forEach(sheetName => {
                const ws = wb.Sheets[sheetName];
                const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });
                
                if (rows.length < 2) return;
                
                // Find header row (first row with column names)
                const headerRow = rows[0];
                const colMap = parseHeaderRow(headerRow);
                
                if (!colMap.name) return;
                
                const students = [];
                for (let i = 1; i < rows.length; i++) {
                    const row = rows[i];
                    if (!row[colMap.name] || String(row[colMap.name]).trim() === '') continue;
                    
                    students.push({
                        no: row[colMap.no] || students.length + 1,
                        name: String(row[colMap.name]).trim(),
                        height: parseNum(row[colMap.height]),
                        weight: parseNum(row[colMap.weight]),
                        lung: colMap.lung !== undefined ? parseNum(row[colMap.lung]) : null,
                        run50: parseNum(row[colMap.run50]),
                        sitReach: parseNum(row[colMap.sitReach]),
                        skipRope: parseNum(row[colMap.skipRope]),
                        sitUps: parseNum(row[colMap.sitUps]),
                        gender: String(row[colMap.gender] || '').trim(),
                    });
                }
                
                if (students.length > 0) {
                    newStudents[sheetName] = students;
                }
            });
            
            if (Object.keys(newStudents).length === 0) {
                showToast('未找到有效数据，请检查Excel格式', 'error');
                return;
            }
            
            // Merge with existing data - preserve history
            const now = new Date();
            const dateStr = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
            
            Object.keys(newStudents).forEach(cls => {
                if (!appData.students[cls]) {
                    // New class - just add it
                    appData.students[cls] = newStudents[cls];
                    return;
                }
                
                const existingStudents = appData.students[cls];
                const newClassStudents = newStudents[cls];
                
                newClassStudents.forEach(newStudent => {
                    // Find matching student by name
                    const existingIdx = existingStudents.findIndex(s => s.name === newStudent.name);
                    
                    if (existingIdx >= 0) {
                        const old = existingStudents[existingIdx];
                        // Check if there's actual old data to save
                        const hasOldData = old.run50 !== null && old.run50 !== undefined ||
                                           old.skipRope !== null && old.skipRope !== undefined ||
                                           old.sitReach !== null && old.sitReach !== undefined ||
                                           old.sitUps !== null && old.sitUps !== undefined;
                        
                        if (hasOldData) {
                            if (!old.history) old.history = [];
                            // Check if there's a difference worth saving
                            const hasNewData = newStudent.run50 !== null || newStudent.skipRope !== null || 
                                               newStudent.sitReach !== null || newStudent.sitUps !== null;
                            if (hasNewData) {
                                const lastEntry = old.history[old.history.length - 1];
                                if (!lastEntry || lastEntry.date !== dateStr) {
                                    old.history.push({
                                        date: dateStr,
                                        run50: old.run50 ?? null,
                                        skipRope: old.skipRope ?? null,
                                        sitReach: old.sitReach ?? null,
                                        sitUps: old.sitUps ?? null,
                                    });
                                }
                            }
                        }
                        
                        // Update with new data, keeping old values where new is null
                        if (newStudent.height !== null) old.height = newStudent.height;
                        if (newStudent.weight !== null) old.weight = newStudent.weight;
                        if (newStudent.run50 !== null) old.run50 = newStudent.run50;
                        if (newStudent.skipRope !== null) old.skipRope = newStudent.skipRope;
                        if (newStudent.sitReach !== null) old.sitReach = newStudent.sitReach;
                        if (newStudent.sitUps !== null) old.sitUps = newStudent.sitUps;
                        if (newStudent.lung !== null) old.lung = newStudent.lung;
                        if (newStudent.gender) old.gender = newStudent.gender;
                    } else {
                        // New student - add to class
                        existingStudents.push(newStudent);
                    }
                });
            });
            
            appData.currentClass = Object.keys(appData.students)[0];
            saveAppData();
            
            // Refresh UI
            initRoster();
            initAnalysis();
            initHomeStats();
            renderRoster();
            
            const totalStudents = Object.values(newStudents).reduce((sum, list) => sum + list.length, 0);
            const totalClasses = Object.keys(newStudents).length;
            showToast(`✅ 成功导入 ${totalClasses} 个班级共 ${totalStudents} 名学生，旧成绩已存入历史记录`, 'success');
            
        } catch(err) {
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
        if (!h) return;
        const hStr = String(h).trim().replace(/\r?\n/g, '');
        if (hStr.includes('序号') || hStr.includes('编号')) map.no = i;
        else if (hStr.includes('姓名') || hStr.includes('名字') || (hStr.length <= 4 && !hStr.includes('身高') && !hStr.includes('性别') && i === 1)) map.name = i;
        else if (hStr.includes('身高')) map.height = i;
        else if (hStr.includes('体重')) map.weight = i;
        else if (hStr.includes('肺活量')) map.lung = i;
        else if (hStr.includes('50米') || hStr.includes('五十米')) map.run50 = i;
        else if (hStr.includes('体前屈')) map.sitReach = i;
        else if (hStr.includes('跳绳')) map.skipRope = i;
        else if (hStr.includes('仰卧') || hStr.includes('起坐')) map.sitUps = i;
        else if (hStr.includes('性别')) map.gender = i;
    });
    return map;
}

function parseNum(val) {
    if (val === null || val === undefined || val === '') return null;
    const num = parseFloat(val);
    return isNaN(num) ? null : num;
}
