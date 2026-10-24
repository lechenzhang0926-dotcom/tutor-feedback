'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { routeHomeworkLink } from '@/lib/homeworkUtils';
import { buildHomeworkMessage } from '@/lib/homeworkMessage';
import { getBeijingISODate } from '@/lib/beijingTime';
import { getStudents, saveStudent } from '@/lib/storage';
import { matchStudentNames } from '@/lib/studentMatch';
import { extractStudentNo, findStudentByNo } from '@/lib/studentNo';
import type { StudentProfile } from '@/lib/types';
import { incrementHomeworkMsgCount, incrementTotalHomeworkCount, recordStudentUsage } from '@/lib/dashboardUtils';

interface Props {
  toast: (msg: string) => void;
  onCopy: (text: string) => void;
}

interface LinkGroup {
  link1: string;
  link2: string;
  link3: string;
  link4: string;
}

interface StudentEntry {
  id: string;
  name: string;
  links: LinkGroup;
}

interface GeneratedFile {
  name: string;
  size: number;
  error?: string;
}

interface StudentResult {
  studentName: string;
  sessionId: string;
  files: GeneratedFile[];
  message: string;
  error?: string;
  generating?: boolean;
}

const SLOT_LABELS: { key: keyof LinkGroup; label: string }[] = [
  { key: 'link1', label: '作业1（打印页/PDF）' },
  { key: 'link2', label: '作业2（抗遗忘）' },
  { key: 'link3', label: '作业3（极简造句）' },
  { key: 'link4', label: '作业4（句式）' },
];

function extractUrls(text: string): string[] {
  return (text.match(/https?:\/\/[^\s,，\n]+/gi) || []).map((u) => u.trim());
}

function formatMMDD(date: string): string {
  const m = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return '';
  return `${m[2]}${m[3]}`;
}

export function BatchHomeworkTab({ toast, onCopy }: Props) {
  const [pasted, setPasted] = useState('');
  const [date, setDate] = useState('');
  const [groups, setGroups] = useState<StudentEntry[]>([]);
  const [parseError, setParseError] = useState('');
  const [generating, setGenerating] = useState(false);
  const [results, setResults] = useState<StudentResult[]>([]);
  const [copiedName, setCopiedName] = useState('');
  const [autoListen, setAutoListen] = useState(false);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  // 解析后对比档案：哪些识别到的学生名不在档案中（待加入）
  const [unknownStudents, setUnknownStudents] = useState<string[]>([]);
  // 识别名 → 档案名的对应关系（如 龚浩博 → 浩博），用于在界面上说明「已对应到档案」
  const [nameAliases, setNameAliases] = useState<{ detected: string; archive: string }[]>([]);
  // 学生名 → 编号（链接里的数字），新学生加入档案时一并保存，下次按编号即可直接识别
  const [studentNoByName, setStudentNoByName] = useState<Record<string, string>>({});

  const toggleExpand = useCallback((idx: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }, []);

  const setAllExpanded = useCallback((open: boolean) => {
    if (open) setExpanded(new Set(groups.map((_, i) => i)));
    else setExpanded(new Set());
  }, [groups]);

  // 镜像最新 pasted，供剪贴板监听/导入时做去重判断（避免闭包拿到旧值）
  const pastedRef = useRef('');
  const lastClipRef = useRef('');

  // --------------- 草稿自动保存 ---------------
  //
  // 目的：页面被重载/浏览器切走再回来时，粘贴的链接和**已生成的结果**都不要丢。
  // 已生成的结果尤其重要 —— 重新生成既要等时间，又要再花一次 API 费用。
  //
  // 顺序要求：先恢复、再保存。保存一旦先跑，就会用初始空值覆盖掉草稿。
  const BATCH_DRAFT_KEY = 'tutor_draft_homework_batch';
  const draftRestoredRef = useRef(false);

  useEffect(() => {
    let restoredDate: string | null = null;
    try {
      const raw = localStorage.getItem(BATCH_DRAFT_KEY);
      if (raw) {
        const d = JSON.parse(raw) as {
          savedAt?: number;
          date?: string;
          pasted?: string;
          groups?: StudentEntry[];
          results?: StudentResult[];
          studentNoByName?: Record<string, string>;
        };
        // 只恢复 24 小时内的草稿
        const fresh = d.savedAt ? Date.now() - d.savedAt < 24 * 60 * 60 * 1000 : false;
        if (fresh) {
          if (d.pasted) setPasted(d.pasted);
          if (Array.isArray(d.groups) && d.groups.length) setGroups(d.groups);
          if (Array.isArray(d.results) && d.results.length) {
            // 清掉「生成中」标记：上次可能是在生成途中被切走/重载的，
            // 不清的话恢复后会一直显示"生成中"卡住。
            setResults(d.results.map((r) => ({ ...r, generating: false })));
          }
          if (d.studentNoByName) setStudentNoByName(d.studentNoByName);
          if (d.date) restoredDate = d.date;
        } else {
          localStorage.removeItem(BATCH_DRAFT_KEY);
        }
      }
    } catch {
      // 草稿损坏就忽略
    }

    setDate(restoredDate || getBeijingISODate());
    draftRestoredRef.current = true;
  }, []);

  useEffect(() => {
    if (!draftRestoredRef.current) return;
    const draft = {
      savedAt: Date.now(),
      date,
      pasted,
      groups,
      results,
      studentNoByName,
    };
    try {
      localStorage.setItem(BATCH_DRAFT_KEY, JSON.stringify(draft));
    } catch {
      // 隐私模式或存储已满时忽略
    }
  }, [date, pasted, groups, results, studentNoByName]);

  useEffect(() => {
    pastedRef.current = pasted;
  }, [pasted]);

  // 解析分组后，把识别到的学生名与档案对比，找出不在档案中的新学生
  useEffect(() => {
    const names = groups.map((g) => g.name).filter((n) => n && n !== '(未识别学生)');
    const existing = new Set(getStudents().map((s) => s.name.toLowerCase()));
    const unknown = Array.from(new Set(names)).filter((n) => !existing.has(n.toLowerCase()));
    setUnknownStudents(unknown);
  }, [groups]);

  /** 把识别到的学生名加入档案（同时记住编号，下次遇到同一编号即可直接对应） */
  const addStudentToProfile = useCallback((name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const now = new Date().toISOString();
    const no = studentNoByName[trimmed] || '';
    const s: StudentProfile = {
      id: Date.now().toString() + Math.random().toString(36).slice(2, 6),
      name: trimmed,
      studentNo: no || undefined,
      recentFeedbacks: [],
      createdAt: now,
      updatedAt: now,
    };
    saveStudent(s);
    setUnknownStudents((prev) => prev.filter((n) => n !== trimmed));
    toast(no ? `已添加"${trimmed}"到学生档案（编号 ${no}）` : `已添加"${trimmed}"到学生档案`);
  }, [toast, studentNoByName]);

  // --------------- 解析并分组 ---------------
  const handleParse = useCallback(async (textOverride?: string) => {
    const rawUrls = extractUrls(textOverride ?? pasted);
    // 按 URL 去重：同一个链接粘多次只处理一次。
    // 否则会被送去 /api/extract-student-names 重复下载同一个 PDF 来识别名字，
    // 也会重复塞进同一名学生的同一个作业槽（生成时再下一遍）。
    const urls = Array.from(new Set(rawUrls));
    if (urls.length === 0) {
      setParseError('没有检测到任何链接，请粘贴包含 http(s) 链接的内容');
      setGroups([]);
      setNameAliases([]);
      setStudentNoByName({});
      return;
    }
    setParseError('');
    setResults([]);
    setNameAliases([]);
    setStudentNoByName({});

    let names: string[] = [];
    try {
      const res = await fetch('/api/extract-student-names', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls }),
      });
      if (res.ok) {
        const data = await res.json();
        names = data.names || [];
      }
    } catch {
      // 提取失败则全部按未识别处理
    }

    // ---- 识别学生：编号优先，名字兜底 ----
    // 编号（链接里的数字，如 ?id=247343）由系统分配、不会变动，
    // 而学生名可能识别不准或重名，所以编号能对应上就以编号为准。
    const nos = urls.map((u) => extractStudentNo(u));
    const archiveStudents = getStudents();

    // 名字兜底：识别到的常是「龚浩博」这种带姓全名，
    // 档案里可能存的是「浩博」，这里做包含关系匹配。
    const distinctNames = Array.from(new Set(names.map((n) => (n || '').trim()).filter(Boolean)));
    const { results: matched, collisions } = matchStudentNames(distinctNames);
    const aliasOf = new Map<string, string>();
    distinctNames.forEach((raw, i) => {
      const r = matched[i];
      // 只有真的换了个名字才记为别名（完全一致不算）
      if (r.matched && r.kind !== 'exact') aliasOf.set(raw, r.name);
    });

    // 每个链接最终归属的学生名
    const resolvedNames = urls.map((_, i) => {
      const no = nos[i];
      if (no) {
        const byNo = findStudentByNo(no, archiveStudents);
        if (byNo) return byNo.name; // 编号命中，最可靠
      }
      const rawName = (names[i] || '').trim();
      if (!rawName) return '';
      return aliasOf.get(rawName) ?? rawName;
    });

    // 安全网：编号指向的人 与 名字指向的人 不一致。
    // 可能原因：① 链接里的数字其实不是学生编号（比如每次作业都变的作业记录号）；
    //          ② 档案里的对应关系是错的。
    // 这种情况仍以编号为准（编号本应最可靠），但必须明确提示，避免作业错发给别人。
    const noConflicts: string[] = [];
    urls.forEach((_, i) => {
      const no = nos[i];
      if (!no) return;
      const byNo = findStudentByNo(no, archiveStudents);
      if (!byNo) return;
      const rawName = (names[i] || '').trim();
      if (!rawName) return;
      const byName = aliasOf.get(rawName) ?? rawName;
      // 名字确实对应到档案里的另一个学生，且与编号指向的不同 → 冲突
      const nameInArchive = archiveStudents.some((s) => s.name === byName);
      if (!nameInArchive || byName === byNo.name) return;
      const desc = `${byNo.name}（编号${no}）vs ${byName}（文档名字）`;
      if (!noConflicts.includes(desc)) noConflicts.push(desc);
    });

    // 界面提示：识别名被换成了档案里的哪个名字（含按编号命中的情况）
    const aliases: { detected: string; archive: string }[] = [];
    const aliasSeen = new Set<string>();
    urls.forEach((_, i) => {
      const rawName = (names[i] || '').trim();
      const resolved = resolvedNames[i];
      if (!rawName || !resolved || rawName === resolved) return;
      const key = `${rawName}=>${resolved}`;
      if (aliasSeen.has(key)) return;
      aliasSeen.add(key);
      aliases.push({ detected: rawName, archive: resolved });
    });
    setNameAliases(aliases);

    const order: StudentEntry[] = [];
    const map = new Map<string, StudentEntry>();
    const noByGroup = new Map<string, string>(); // 分组名 → 该组链接里的编号
    let current = '';
    let unnamed = 0;

    for (let i = 0; i < urls.length; i++) {
      const url = urls[i].trim();
      const name = resolvedNames[i];
      if (name) current = name;

      const key = current || `__unnamed_${unnamed++}`;
      let entry = map.get(key);
      if (!entry) {
        entry = { id: key, name: current || '(未识别学生)', links: { link1: '', link2: '', link3: '', link4: '' } };
        map.set(key, entry);
        order.push(entry);
      }
      // 记下这组的编号，供后面写回档案
      if (nos[i] && !noByGroup.has(entry.name)) noByGroup.set(entry.name, nos[i]);
      const slot = routeHomeworkLink(url);
      entry.links[slot] = entry.links[slot] ? `${entry.links[slot]}\n${url}` : url;
    }

    // 记住「学生名 ↔ 编号」：下次遇到同一编号，无需识别名字即可直接对应到该学生。
    // 只补档案里还没有编号（或编号变了）的学生，已有的不动。
    // 但若本次出现「编号与名字打架」，说明编号可能不可靠，此时先不写档案，
    // 免得把错误的对应关系固化下来（等用户核对后再让它自动记住）。
    if (noConflicts.length === 0) {
      Array.from(noByGroup.entries()).forEach(([gName, no]) => {
        if (!gName || gName === '(未识别学生)') return;
        const st = archiveStudents.find((s) => s.name === gName);
        if (!st || st.studentNo === no) return; // 档案里没有 → 等「加入档案」时一并保存
        saveStudent({ ...st, studentNo: no, updatedAt: new Date().toISOString() });
      });
    }

    // 新学生加入档案时要带上编号，所以先把编号按名字存下来
    const noMap: Record<string, string> = {};
    Array.from(noByGroup.entries()).forEach(([gName, no]) => {
      if (gName && gName !== '(未识别学生)') noMap[gName] = no;
    });
    setStudentNoByName(noMap);

    setGroups(order);

    const dupCount = rawUrls.length - urls.length;
    const dupHint = dupCount > 0 ? `（已去掉 ${dupCount} 个重复链接）` : '';

    // 编号与名字打架 —— 最危险，优先提示（可能导致作业发给错的学生）
    if (noConflicts.length > 0) {
      toast(`⚠️ 编号与文档名字不一致：${noConflicts.join('；')}。已按编号归到学生，请核对档案里的编号是否正确${dupHint}`);
    } else if (collisions.size > 0) {
      // 多个不同识别名被对应到同一个档案名 —— 可能是两个学生撞名，需人工确认
      const desc = Array.from(collisions.entries())
        .map(([archive, list]) => `${list.join('、')} → ${archive}`)
        .join('；');
      toast(`注意：${desc}，请确认是否为同一名学生${dupHint}`);
    } else if (order.some((g) => g.name === '(未识别学生)')) {
      toast(`部分链接未识别到学生名，请在下方手动填写${dupHint}`);
    } else {
      toast(`已按 ${order.length} 名学生分组${dupHint}`);
    }
  }, [pasted, toast]);

  // 把一批链接追加进文本框（按 URL 去重），返回新增条数
  const appendUrls = useCallback((urls: string[]): number => {
    const prev = pastedRef.current;
    const existing = new Set(extractUrls(prev));
    const newOnes = urls.filter((u) => !existing.has(u));
    if (newOnes.length === 0) return 0;
    const merged = prev.trim() ? `${prev.trim()}\n${newOnes.join('\n')}` : newOnes.join('\n');
    pastedRef.current = merged;
    setPasted(merged);
    return newOnes.length;
  }, []);

  // 从剪贴板读取并导入；autoparse=true 时导入后立即解析分组
  const importFromClipboard = useCallback(async (autoparse = false) => {
    try {
      const txt = await navigator.clipboard.readText();
      if (!txt.trim()) {
        toast('剪贴板为空');
        return;
      }
      const urls = extractUrls(txt);
      if (urls.length === 0) {
        toast('剪贴板里没有链接');
        return;
      }
      const added = appendUrls(urls);
      if (added === 0) {
        toast('剪贴板链接均已存在，无新增');
        return;
      }
      toast(`已导入 ${added} 条链接`);
      if (autoparse) handleParse(pastedRef.current);
    } catch {
      toast('无法读取剪贴板，请在浏览器授权“读取剪贴板”权限');
    }
  }, [appendUrls, toast, handleParse]);

  // 自动监听剪贴板：开启后，每次复制含链接的内容都会自动追加（无新增则不动作）
  useEffect(() => {
    if (!autoListen) return;
    const timer = setInterval(async () => {
      try {
        const txt = await navigator.clipboard.readText();
        if (!txt || txt === lastClipRef.current) return;
        lastClipRef.current = txt;
        const urls = extractUrls(txt);
        if (urls.length > 0) {
          const added = appendUrls(urls);
          if (added > 0) toast(`自动导入 ${added} 条链接`);
        }
      } catch {
        // 权限未授予或页面未聚焦时静默
      }
    }, 1500);
    return () => clearInterval(timer);
  }, [autoListen, appendUrls, toast]);

  const updateGroupName = useCallback((id: string, name: string) => {
    setGroups((prev) => prev.map((g) => (g.id === id ? { ...g, name } : g)));
  }, []);

  // --------------- 逐个学生生成 PDF + 群消息（实时进度） ---------------
  const handleGenerate = useCallback(async () => {
    if (groups.length === 0) return;
    const formatted = formatMMDD(date);
    if (!formatted) {
      toast('日期格式无效');
      return;
    }

    setGenerating(true);
    setResults([]);

    let failCount = 0;

    for (const g of groups) {
      const name = g.name.trim();
      const isUnnamed = !name || name === '(未识别学生)';

      // 先推一个“生成中”占位，UI 立即有反馈
      setResults((prev) => [
        ...prev,
        { studentName: name || '(未识别学生)', sessionId: '', files: [], message: '', generating: true },
      ]);

      if (isUnnamed) {
        failCount++;
        setResults((prev) =>
          prev.map((r, i) => (i === prev.length - 1 ? { ...r, generating: false, error: '缺少学生名，跳过' } : r))
        );
        continue;
      }

      const link1 = g.links.link1.trim();
      const link2 = g.links.link2.trim();
      const link3 = g.links.link3.trim();
      const link4 = g.links.link4.trim();
      if (!link1 && !link2 && !link3 && !link4) {
        failCount++;
        setResults((prev) =>
          prev.map((r, i) => (i === prev.length - 1 ? { ...r, generating: false, error: '没有任何作业链接，跳过' } : r))
        );
        continue;
      }

      try {
        const res = await fetch('/api/generate-homework-pdfs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            studentName: name,
            date: formatted,
            link1: link1 || undefined,
            link2: link2 || undefined,
            link3: link3 || undefined,
            link4: link4 || undefined,
          }),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          failCount++;
          setResults((prev) =>
            prev.map((r, i) => (i === prev.length - 1 ? { ...r, generating: false, error: err.error || `生成失败 (${res.status})` } : r))
          );
          continue;
        }

        const data = await res.json();
        // 仅当有作业1链接时才生成群消息；无作业1只出 PDF
        const message = link1 ? buildHomeworkMessage({ studentName: name, date, link1 }) : '';
        const result: StudentResult = { studentName: name, sessionId: data.sessionId, files: data.files, message };
        setResults((prev) => prev.map((r, i) => (i === prev.length - 1 ? result : r)));

        // 记录使用量（最佳努力，匹配不到档案也不影响生成）
        incrementTotalHomeworkCount();
        const st = getStudents().find((s) => s.name === name);
        if (st) recordStudentUsage(st.id);
        // 仅当有作业1链接时才计入「作业消息」次数
        if (link1) incrementHomeworkMsgCount();
      } catch {
        failCount++;
        setResults((prev) =>
          prev.map((r, i) => (i === prev.length - 1 ? { ...r, generating: false, error: '生成请求异常，请重试' } : r))
        );
      }
    }

    setGenerating(false);
    toast(failCount ? `生成完成，${failCount} 名学生失败` : `已为 ${groups.length} 名学生生成作业`);
  }, [groups, date, toast]);

  // --------------- 下载 ---------------
  const downloadSingle = useCallback((sessionId: string, fileName: string) => {
    const a = document.createElement('a');
    a.href = `/api/download-pdf?session=${encodeURIComponent(sessionId)}&name=${encodeURIComponent(fileName)}`;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, []);

  const downloadAll = useCallback(() => {
    let i = 0;
    results.forEach((r) => {
      r.files.filter((f) => !f.error).forEach((f) => {
        const session = r.sessionId;
        const name = f.name;
        setTimeout(() => downloadSingle(session, name), i * 80);
        i++;
      });
    });
  }, [results, downloadSingle]);

  // 单个学生的文档：一键全部下载（错开触发，避免浏览器拦截）
  const downloadStudent = useCallback((sessionId: string, files: GeneratedFile[]) => {
    const valid = files.filter((f) => !f.error);
    valid.forEach((f, i) => {
      setTimeout(() => downloadSingle(sessionId, f.name), i * 80);
    });
  }, [downloadSingle]);

  const handleCopyMessage = useCallback((text: string, name: string) => {
    onCopy(text);
    setCopiedName(name);
    setTimeout(() => setCopiedName(''), 1500);
  }, [onCopy]);

  // 按学生顺序拼接所有成功的群消息，一次性复制到剪贴板
  const copyAllMessages = useCallback(() => {
    const ok = results.filter((r) => !r.error && r.message);
    if (ok.length === 0) {
      toast('暂无可复制的消息');
      return;
    }
    onCopy(ok.map((r) => r.message).join('\n\n'));
    toast(`已复制 ${ok.length} 条作业消息`);
  }, [results, onCopy, toast]);

  const totalFiles = results.reduce((sum, r) => sum + r.files.filter((f) => !f.error).length, 0);

  return (
    <>
      <div className="card">
        <div className="card-title">批量作业（多学生）</div>
        <div className="hint" style={{ marginBottom: 12 }}>
          把助手发来的所有学生作业链接一次性粘贴进来（每行一个，可混合多个学生）。系统会自动按学生分组、识别姓名、归位到对应作业，并按下方的顺序逐个生成群消息与 PDF。
        </div>

        <div className="field">
          <label>粘贴所有作业链接</label>
          <textarea
            placeholder={'https://test.hzdmsyy.com/pc/prints?id=...\nhttps://test.hzdmsyy.com/pc/prints/review-cycle-paper?id=...\n（把不同学生的链接都粘进来即可）'}
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
            className="hw-paste"
            style={{ minHeight: 280 }}
          />
          <div className="btn-row" style={{ marginTop: 8 }}>
            <button className="btn btn-ghost" onClick={() => importFromClipboard(false)}>
              从剪贴板导入
            </button>
            <button className="btn btn-ghost" onClick={() => importFromClipboard(true)}>
              导入并解析
            </button>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '.82rem', color: 'var(--muted)', cursor: 'pointer' }}>
              <input type="checkbox" checked={autoListen} onChange={(e) => setAutoListen(e.target.checked)} />
              自动监听剪贴板
            </label>
          </div>
        </div>

        <div className="field">
          <label>日期</label>
          <div className="form-row">
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
            <button className="btn btn-ghost" onClick={() => setDate(getBeijingISODate())} style={{ whiteSpace: 'nowrap' }}>
              今天
            </button>
          </div>
        </div>

        <div className="btn-row">
          <button className="btn btn-primary" onClick={() => handleParse()} disabled={!pasted.trim()}>
            解析并分组
          </button>
          <button
            className="btn btn-primary"
            onClick={handleGenerate}
            disabled={groups.length === 0 || generating}
          >
            {generating ? '正在生成...' : `为 ${groups.length} 名学生生成`}
          </button>
          <button
            className="btn btn-ghost"
            onClick={() => {
              setPasted('');
              setGroups([]);
              setResults([]);
              setParseError('');
              setUnknownStudents([]);
              setNameAliases([]);
              setStudentNoByName({});
            }}
          >
            清空
          </button>
        </div>

        {parseError && <div style={{ color: 'var(--danger)', fontSize: '.85rem', marginTop: 10 }}>{parseError}</div>}
      </div>

      {/* 分组预览（可修正学生名） */}
      {groups.length > 0 && (
        <div className="card">
          <div className="card-title">
            已分组（共 {groups.length} 名学生，按粘贴顺序）
            {groups.some((g) => g.name === '(未识别学生)') && (
              <span className="hw-pending-badge" style={{ marginLeft: 8 }}>有未识别，请补全</span>
            )}
          </div>
          <div className="hw-group-list">
            {groups.map((g, idx) => {
              const unnamed = g.name === '(未识别学生)';
              return (
                <div className="hw-group-card" key={g.id}>
                  <div className="hw-group-head">
                    <span className="hw-group-idx">{idx + 1}.</span>
                    <input
                      type="text"
                      className={`hw-name-input${unnamed ? ' pending' : ''}`}
                      value={unnamed ? '' : g.name}
                      placeholder="输入学生名"
                      onChange={(e) => updateGroupName(g.id, e.target.value)}
                    />
                    {unnamed && <span className="hw-pending-badge">待填写</span>}
                  </div>
                  <div className="hw-chips">
                    {SLOT_LABELS.map(({ key, label }) => {
                      const filled = !!g.links[key].trim();
                      return (
                        <span key={key} className={`hw-chip ${filled ? 'filled' : 'empty'}`}>
                          {label}：{filled ? g.links[key].split('\n').length + ' 条' : '未填'}
                        </span>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 名字对应提示：识别到的全名已对应到档案里已有的学生 */}
      {nameAliases.length > 0 && (
        <div className="card" style={{ borderColor: 'var(--accent)', padding: '12px 14px' }}>
          <div className="hint" style={{ marginBottom: 6 }}>
            已对应到学生档案：
          </div>
          <div className="btn-row" style={{ flexWrap: 'wrap', gap: 6 }}>
            {nameAliases.map((a) => (
              <span
                key={`${a.detected}-${a.archive}`}
                className="btn btn-ghost"
                style={{ fontSize: '.78rem', padding: '3px 10px', cursor: 'default' }}
              >
                {a.detected} → {a.archive}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* 新学生未入档提示：对比档案后，识别到但档案中没有的名字 */}
      {unknownStudents.length > 0 && (
        <div className="card" style={{ borderColor: 'var(--accent)' }}>
          <div className="card-title">以下学生不在档案中</div>
          <div className="hint" style={{ marginBottom: 10 }}>
            系统已从 PDF 中识别出这些名字，但档案里没有对应记录。可一键加入档案（用于记录使用量、下次自动匹配）。
          </div>
          <div className="btn-row" style={{ flexWrap: 'wrap', gap: 8 }}>
            {unknownStudents.map((n) => (
              <button key={n} className="btn btn-ghost" onClick={() => addStudentToProfile(n)}>
                + 加入档案：{n}
              </button>
            ))}
            <button className="btn btn-primary" onClick={() => unknownStudents.forEach((n) => addStudentToProfile(n))}>
              全部加入
            </button>
          </div>
        </div>
      )}

      {/* 生成结果（按学生顺序，紧凑列表 + 进度条） */}
      {results.length > 0 && (
        <div className="card">
          <div className="card-title" style={{ flexWrap: 'wrap', gap: 10 }}>
            <span>
              {generating
                ? `生成结果（进行中 ${results.filter((r) => !r.generating).length} / ${groups.length}）`
                : `生成结果（${results.length} 名学生，${totalFiles} 个 PDF）`}
            </span>
            <span style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
              {results.filter((r) => !r.error && r.message).length > 0 && (
                <button className="btn btn-ghost" onClick={copyAllMessages} style={{ fontSize: '.78rem', padding: '4px 14px' }}>
                  复制全部消息
                </button>
              )}
              {totalFiles > 0 && (
                <button className="btn btn-ghost" onClick={downloadAll} style={{ fontSize: '.78rem', padding: '4px 14px' }}>
                  下载全部 PDF
                </button>
              )}
              <button
                className="btn btn-ghost"
                onClick={() => setAllExpanded(expanded.size === 0)}
                style={{ fontSize: '.78rem', padding: '4px 14px' }}
              >
                {expanded.size === 0 ? '展开全部' : '收起全部'}
              </button>
            </span>
          </div>

          <div className="hw-progress-top">
            <div className="hw-progress-track">
              <div
                className="hw-progress-fill"
                style={{ width: `${results.length ? (results.filter((r) => !r.generating).length / results.length) * 100 : 0}%` }}
              />
            </div>
            <span className="hw-progress-label">
              {results.filter((r) => !r.generating).length} / {results.length}
            </span>
          </div>

          <div className="hw-result-list">
            {results.map((r, idx) => {
              const status = r.generating ? 'generating' : r.error ? 'error' : 'done';
              const statusText = r.generating ? '生成中' : r.error ? '失败' : '完成';
              const validFiles = r.files.filter((f) => !f.error).length;
              const isOpen = expanded.has(idx);
              return (
                <div className={`hw-result-row${isOpen ? ' open' : ''}`} key={`${r.studentName}-${idx}`}>
                  <div className="hw-result-head" onClick={() => toggleExpand(idx)}>
                    <span className="hw-result-idx">{idx + 1}</span>
                    <span className="hw-result-name">{r.studentName}</span>
                    {!r.generating && !r.error && !r.message && (
                      <span className="hw-result-note">无作业1，仅 PDF</span>
                    )}
                    <span className="hw-result-meta">
                      {validFiles > 0 && `${validFiles} PDF`}
                      {r.error && r.error}
                    </span>
                    <span className={`hw-status ${status}`}>
                      {r.generating && <span className="hw-spinner" style={{ marginRight: 5 }} />}
                      {statusText}
                    </span>
                    <span className="hw-result-chevron">▶</span>
                  </div>

                  {isOpen && (
                    <div className="hw-result-detail">
                      {!r.generating && !r.error && r.message && (
                        <>
                          <div className="output-area" style={{ marginTop: 12 }}>{r.message}</div>
                          <div className="btn-row">
                            <button className="btn btn-primary" onClick={() => handleCopyMessage(r.message, r.studentName)}>
                              {copiedName === r.studentName ? '已复制' : '复制作业消息'}
                            </button>
                          </div>
                        </>
                      )}
                      {!r.generating && !r.error && !r.message && (
                        <div style={{ fontSize: '.8rem', color: 'var(--muted)', marginTop: 12 }}>
                          无作业1链接，已生成 PDF，未生成群消息
                        </div>
                      )}
                      {!r.generating && r.error && (
                        <div style={{ color: 'var(--danger)', fontSize: '.82rem', marginTop: 12 }}>⚠ {r.error}</div>
                      )}

                      {r.files.length > 0 && (
                        <div style={{ marginTop: 10 }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                            <span style={{ fontSize: '.78rem', color: 'var(--muted)' }}>
                              PDF 文档（{validFiles}）
                            </span>
                            {validFiles > 1 && r.sessionId && (
                              <button
                                className="btn btn-primary"
                                style={{ fontSize: '.74rem', padding: '4px 14px' }}
                                onClick={() => downloadStudent(r.sessionId, r.files)}
                              >
                                一键下载全部
                              </button>
                            )}
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {r.files.map((f) => (
                              <div
                                key={f.name}
                                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: '.85rem' }}
                              >
                                <span style={{ color: f.error ? 'var(--danger)' : 'var(--text)' }}>
                                  {f.error ? '⚠ ' : '✅ '}
                                  {f.name}
                                  {!f.error && <span style={{ marginLeft: 8, fontSize: '.72rem', color: 'var(--muted)' }}>{formatFileSize(f.size)}</span>}
                                  {f.error && <span style={{ marginLeft: 8, fontSize: '.72rem' }}>{f.error}</span>}
                                </span>
                                {!f.error && r.sessionId && (
                                  <button className="btn btn-ghost" style={{ fontSize: '.74rem', padding: '3px 12px' }} onClick={() => downloadSingle(r.sessionId, f.name)}>
                                    下载
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
