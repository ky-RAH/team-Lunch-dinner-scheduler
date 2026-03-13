const STORAGE_KEY = "team-dinner-scheduler-state-v1";

const TEAM_MEMBERS = [
  "김미령",
  "권정희",
  "라경연",
  "민가영",
  "박재경",
  "변우영",
  "서충희",
  "염윤아",
  "윤가영",
  "윤효주",
  "이제규",
  "정연정",
  "강승아",
  "고유미",
  "김난희",
  "김승하",
  "김정연",
  "이문영",
].map((name, index) => ({
  id: `user-${index + 1}`,
  name,
  department: `Team ${Math.floor(index / 6) + 1}`,
}));

const SETTINGS = {
  startDate: "2026-03-16",
  endDate: "2026-03-31",
};

const state = {
  currentView: "vote",
  currentUserId: TEAM_MEMBERS[0].id,
  users: TEAM_MEMBERS,
  slots: generateSlots(SETTINGS.startDate, SETTINGS.endDate),
  votes: {},
  submissions: {},
  selectedUserId: null,
  teams: [],
  activeTeamCount: 3,
  publicUrl: "",
};

loadPersistedState();

const heroStatsEl = document.getElementById("hero-stats");
const appEl = document.getElementById("app");

render();

function loadPersistedState() {
  TEAM_MEMBERS.forEach((user) => {
    state.votes[user.id] = [];
  });

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return;
  }

  try {
    const parsed = JSON.parse(raw);
    state.currentUserId = parsed.currentUserId || state.currentUserId;
    state.votes = { ...state.votes, ...(parsed.votes || {}) };
    state.submissions = parsed.submissions || {};
    state.teams = parsed.teams || [];
    state.activeTeamCount = parsed.activeTeamCount || 3;
    state.publicUrl = parsed.publicUrl || "";
  } catch (error) {
    console.error("Failed to parse saved state", error);
  }
}

function persistState() {
  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      currentUserId: state.currentUserId,
      votes: state.votes,
      submissions: state.submissions,
      teams: state.teams,
      activeTeamCount: state.activeTeamCount,
      publicUrl: state.publicUrl,
    })
  );
}

function render() {
  renderHeroStats();
  appEl.innerHTML = `
    ${renderViewToggle()}
    ${renderVoteSection()}
    ${renderAssignmentSection()}
    ${renderManualSection()}
    <section class="footer-note">
      자동편성 규칙: 2026년 3월 16일(월)부터 빠른 일정 우선, 같은 일정 안에서는 먼저 투표 저장한 순서 우선, 3팀 우선 시도 후 불가하면 4팀으로 재시도합니다.
    </section>
  `;

  bindCommonEvents();
  bindVoteEvents();
  bindAssignmentEvents();
  bindManualEvents();
}

function renderHeroStats() {
  const summary = getSummary();
  heroStatsEl.innerHTML = [
    statCard("대상 인원", `${state.users.length}명`),
    statCard("응답 완료", `${summary.completedCount}명`),
    statCard("후보 슬롯", `${state.slots.length}개`),
    statCard("편성 결과", state.teams.length ? `${state.activeTeamCount}팀` : "미생성"),
  ].join("");
}

function renderViewToggle() {
  const buttons = [
    ["vote", "투표"],
    ["assignment", "자동편성"],
    ["manual", "수동 조정"],
  ];

  return `
    <section class="panel">
      <div class="view-toggle">
        ${buttons
          .map(
            ([key, label]) => `
              <button class="${state.currentView === key ? "active" : "ghost"}" data-view="${key}">
                ${label}
              </button>
            `
          )
          .join("")}
      </div>
    </section>
  `;
}

function renderVoteSection() {
  const user = getCurrentUser();
  const userVote = state.votes[user.id] || [];
  const submission = state.submissions[user.id];

  return `
    <section class="panel" style="${state.currentView === "vote" ? "" : "display:none"}">
      <div class="panel-header">
        <div>
          <h2>투표</h2>
          <p class="muted">실제 사용을 위해 기본 선택값은 비워두었습니다. 원하는 일정만 저장하면 제출 시각이 기록됩니다.</p>
        </div>
        <div class="inline-controls">
          <select id="user-select">
            ${state.users
              .map(
                (member) => `
                  <option value="${member.id}" ${member.id === state.currentUserId ? "selected" : ""}>
                    ${member.name}
                  </option>
                `
              )
              .join("")}
          </select>
          <span class="tag">선택 슬롯 ${userVote.length}개</span>
        </div>
      </div>
      <div class="panel">
        <div class="schedule-table">
          <table>
            <thead>
              <tr>
                <th>날짜</th>
                <th>
                  <div class="header-actions">
                    <span>점심</span>
                    <button class="ghost small" data-meal-toggle="lunch">점심 모두선택</button>
                  </div>
                </th>
                <th>
                  <div class="header-actions">
                    <span>저녁</span>
                    <button class="ghost small" data-meal-toggle="dinner">저녁 모두선택</button>
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              ${groupSlotsByDate()
                .map(({ date, lunch, dinner }) => `
                  <tr>
                    <td>
                      <strong>${formatDate(date)}</strong>
                      <div class="mini">${weekdayLabel(date)}</div>
                    </td>
                    <td>
                      <label class="slot-label">
                        <input type="checkbox" data-slot="${lunch.id}" ${userVote.includes(lunch.id) ? "checked" : ""} />
                        점심
                      </label>
                    </td>
                    <td>
                      <label class="slot-label">
                        <input type="checkbox" data-slot="${dinner.id}" ${userVote.includes(dinner.id) ? "checked" : ""} />
                        저녁
                      </label>
                    </td>
                  </tr>
                `)
                .join("")}
            </tbody>
          </table>
        </div>
        <div class="action-row" style="margin-top:16px">
          <button class="primary" id="save-vote">투표 저장</button>
          <button class="ghost" id="clear-vote">선택 비우기</button>
        </div>
        <p class="mini" style="margin-top:12px">
          ${submission ? `최초 저장: ${formatDateTime(submission.submittedAt)} / 최근 수정: ${formatDateTime(submission.updatedAt)}` : "아직 저장되지 않았습니다."}
        </p>
      </div>
      <div class="panel">
        <h3>선택한 슬롯 보기</h3>
        <div class="chips">
          ${
            userVote.length
              ? userVote.map((slotId) => `<span class="slot-pill">${slotLabel(slotId)}</span>`).join("")
              : '<span class="mini">아직 선택한 일정이 없습니다.</span>'
          }
        </div>
      </div>
    </section>
  `;
}

function renderAssignmentSection() {
  const score = assignmentScore();
  const topSlots = getTopSlots(8);

  return `
    <section class="panel" style="${state.currentView === "assignment" ? "" : "display:none"}">
      <div class="panel-header">
        <div>
          <h2>자동편성</h2>
          <p class="muted">편성 결과를 먼저 보여주고, 아래에서 규칙과 응답 현황을 같이 확인할 수 있게 정리했습니다.</p>
        </div>
        <div class="inline-controls">
          <button class="primary" id="auto-assign">자동 편성 실행</button>
          <button class="ghost" id="reset-teams">편성 초기화</button>
        </div>
      </div>

      <div class="panel">
        <div class="panel-header">
          <div>
            <h3>편성 결과</h3>
            <p class="muted">3팀 우선 시도 후, 조건이 안 맞으면 4팀으로 전환합니다.</p>
          </div>
          <span class="tag">${score.summary}</span>
        </div>
        ${
          state.teams.length
            ? `
              <div class="result-grid">
                ${state.teams.map((team) => renderTeamCard(team)).join("")}
              </div>
              <div class="panel" style="margin-top:18px">
                <h3>개인별 배정 결과</h3>
                <div class="person-list">
                  ${state.users
                    .map((user) => {
                      const assignment = findAssignmentForUser(user.id);
                      return `
                        <div class="person-row">
                          <div><strong>${user.name}</strong></div>
                          <div class="mini">${assignment ? `${assignment.team.name} / ${slotLabel(assignment.slotId)}` : "미배정"}</div>
                        </div>
                      `;
                    })
                    .join("")}
                </div>
              </div>
            `
            : '<p class="mini">아직 편성 결과가 없습니다. 투표 저장 후 자동 편성 실행을 눌러 주세요.</p>'
        }
      </div>

      <div class="admin-layout" style="margin-top:18px">
        <div class="panel">
          <h3>편성 기준에 사용된 인기 일정</h3>
          <div class="heat-list">
            ${topSlots
              .map(
                ({ slotId, count }) => `
                  <div class="summary-row">
                    <strong>${slotLabel(slotId)}</strong>
                    <span>${count}명 선택</span>
                  </div>
                `
              )
              .join("")}
          </div>
        </div>
        <div class="panel">
          <h3>응답 현황</h3>
          <div class="person-list">
            ${state.users
              .map((user) => {
                const meta = state.submissions[user.id];
                return `
                  <div class="person-row">
                    <div><strong>${user.name}</strong></div>
                    <div class="mini">${meta ? formatDateTime(meta.submittedAt) : "미제출"}</div>
                  </div>
                `;
              })
              .join("")}
          </div>
        </div>
      </div>

      <div class="panel" style="margin-top:18px">
        <h3>외부 공유 URL</h3>
        <p class="mini">${state.publicUrl ? "현재 생성된 외부 URL입니다." : "아직 외부 URL이 연결되지 않았습니다."}</p>
        <div class="action-row">
          <input id="public-url" value="${state.publicUrl}" readonly placeholder="외부 공개 URL이 생성되면 여기에 표시됩니다." />
          <button class="ghost" id="copy-public-url" ${state.publicUrl ? "" : "disabled"}>URL 복사</button>
        </div>
      </div>
    </section>
  `;
}

function renderManualSection() {
  const assignedIds = new Set(state.teams.flatMap((team) => team.memberIds));
  const unassignedUsers = state.users.filter((user) => !assignedIds.has(user.id));

  return `
    <section class="panel" style="${state.currentView === "manual" ? "" : "display:none"}">
      <div class="panel-header">
        <div>
          <h2>수동 조정</h2>
          <p class="muted">자동 편성 후, 필요한 경우 인원을 다시 이동할 수 있습니다.</p>
        </div>
      </div>
      ${
        state.teams.length
          ? `
            <div class="manual-grid">
              <div class="list-card">
                <h3>팀원 선택</h3>
                <div class="person-list">
                  ${state.users
                    .map(
                      (user) => `
                        <button class="${state.selectedUserId === user.id ? "secondary" : "ghost"}" data-pick-user="${user.id}">
                          ${user.name}${assignedIds.has(user.id) ? "" : " (미배정)"}
                        </button>
                      `
                    )
                    .join("")}
                </div>
                <p class="mini" style="margin-top:12px">현재 선택: ${state.selectedUserId ? userName(state.selectedUserId) : "없음"}</p>
                <p class="${unassignedUsers.length ? "warning" : "mini"}">
                  ${
                    unassignedUsers.length
                      ? `미배정 인원 ${unassignedUsers.length}명`
                      : "모든 인원이 팀에 배정되어 있습니다."
                  }
                </p>
              </div>
              <div class="team-grid">
                ${state.teams
                  .map(
                    (team) => `
                      <div class="team-card manual-team-card">
                        <header>
                          <div>
                            <strong>${team.name}</strong>
                            <div class="mini">${slotLabel(team.slotId)}</div>
                          </div>
                          <span>${team.memberIds.length}명</span>
                        </header>
                        <div class="team-members">
                          ${team.memberIds
                            .map((memberId) => {
                              const mismatch = !(state.votes[memberId] || []).includes(team.slotId);
                              return `<span class="member-chip ${mismatch ? "mismatch" : ""}">${userName(memberId)}</span>`;
                            })
                            .join("")}
                        </div>
                        <div class="allocation-controls">
                          <button class="secondary" data-add-to-team="${team.id}" ${state.selectedUserId ? "" : "disabled"}>
                            선택 인원 추가
                          </button>
                        </div>
                      </div>
                    `
                  )
                  .join("")}
              </div>
            </div>
          `
          : '<p class="mini">먼저 자동 편성 탭에서 팀을 생성해 주세요.</p>'
      }
    </section>
  `;
}

function bindCommonEvents() {
  document.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", () => {
      state.currentView = button.dataset.view;
      render();
    });
  });
}

function bindVoteEvents() {
  const select = document.getElementById("user-select");
  if (select) {
    select.addEventListener("change", (event) => {
      state.currentUserId = event.target.value;
      persistState();
      render();
    });
  }

  document.querySelectorAll("[data-slot]").forEach((checkbox) => {
    checkbox.addEventListener("change", () => {
      const current = new Set(state.votes[state.currentUserId] || []);
      const slotId = checkbox.dataset.slot;
      if (checkbox.checked) {
        current.add(slotId);
      } else {
        current.delete(slotId);
      }
      state.votes[state.currentUserId] = sortSlotIds(Array.from(current));
      persistState();
      render();
    });
  });

  document.querySelectorAll("[data-meal-toggle]").forEach((button) => {
    button.addEventListener("click", () => {
      const mealType = button.dataset.mealToggle;
      const current = new Set(state.votes[state.currentUserId] || []);
      const mealSlots = state.slots.filter((slot) => slot.mealType === mealType).map((slot) => slot.id);
      const allSelected = mealSlots.every((slotId) => current.has(slotId));

      mealSlots.forEach((slotId) => {
        if (allSelected) {
          current.delete(slotId);
        } else {
          current.add(slotId);
        }
      });

      state.votes[state.currentUserId] = sortSlotIds(Array.from(current));
      persistState();
      render();
    });
  });

  const saveButton = document.getElementById("save-vote");
  if (saveButton) {
    saveButton.addEventListener("click", () => {
      const now = new Date().toISOString();
      const previous = state.submissions[state.currentUserId];
      state.submissions[state.currentUserId] = {
        submittedAt: previous?.submittedAt || now,
        updatedAt: now,
      };
      persistState();
      window.alert("투표가 저장되었습니다.");
      render();
    });
  }

  const clearButton = document.getElementById("clear-vote");
  if (clearButton) {
    clearButton.addEventListener("click", () => {
      state.votes[state.currentUserId] = [];
      delete state.submissions[state.currentUserId];
      state.teams = [];
      persistState();
      render();
    });
  }
}

function bindAssignmentEvents() {
  const autoAssignButton = document.getElementById("auto-assign");
  if (autoAssignButton) {
    autoAssignButton.addEventListener("click", () => {
      const result = autoAssignTeams();
      state.teams = result.teams;
      state.activeTeamCount = result.teamCount;
      persistState();
      render();
    });
  }

  const resetButton = document.getElementById("reset-teams");
  if (resetButton) {
    resetButton.addEventListener("click", () => {
      state.teams = [];
      state.activeTeamCount = 3;
      state.selectedUserId = null;
      persistState();
      render();
    });
  }

  const copyButton = document.getElementById("copy-public-url");
  if (copyButton) {
    copyButton.addEventListener("click", async () => {
      if (!state.publicUrl) {
        return;
      }
      await navigator.clipboard.writeText(state.publicUrl);
      window.alert("외부 공유 URL을 복사했습니다.");
    });
  }
}

function bindManualEvents() {
  document.querySelectorAll("[data-pick-user]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedUserId = button.dataset.pickUser;
      render();
    });
  });

  document.querySelectorAll("[data-add-to-team]").forEach((button) => {
    button.addEventListener("click", () => {
      if (!state.selectedUserId) {
        return;
      }

      const team = state.teams.find((entry) => entry.id === button.dataset.addToTeam);
      state.teams.forEach((entry) => {
        entry.memberIds = entry.memberIds.filter((memberId) => memberId !== state.selectedUserId);
      });

      if (team && !team.memberIds.includes(state.selectedUserId)) {
        team.memberIds.push(state.selectedUserId);
      }

      state.selectedUserId = null;
      persistState();
      render();
    });
  });
}

function getSummary() {
  const completedCount = state.users.filter((user) => !!state.submissions[user.id]).length;
  return {
    completedCount,
    pendingCount: state.users.length - completedCount,
  };
}

function statCard(label, value) {
  return `
    <div class="stat-card">
      <span class="stat-label">${label}</span>
      <strong class="stat-value">${value}</strong>
    </div>
  `;
}

function generateSlots(startDate, endDate) {
  const slots = [];
  let current = new Date(`${startDate}T09:00:00`);
  const end = new Date(`${endDate}T09:00:00`);
  while (current <= end) {
    const weekday = current.getDay();
    if (weekday >= 1 && weekday <= 5) {
      const date = current.toISOString().slice(0, 10);
      slots.push({ id: `${date}-lunch`, date, mealType: "lunch" });
      slots.push({ id: `${date}-dinner`, date, mealType: "dinner" });
    }
    current.setDate(current.getDate() + 1);
  }
  return slots;
}

function groupSlotsByDate() {
  const map = new Map();
  state.slots.forEach((slot) => {
    const current = map.get(slot.date) || { date: slot.date };
    current[slot.mealType] = slot;
    map.set(slot.date, current);
  });
  return Array.from(map.values());
}

function sortSlotIds(slotIds) {
  return slotIds.slice().sort((a, b) => slotDateValue(a) - slotDateValue(b));
}

function slotDateValue(slotId) {
  const slot = state.slots.find((entry) => entry.id === slotId);
  if (!slot) {
    return Number.MAX_SAFE_INTEGER;
  }
  return new Date(`${slot.date}T${slot.mealType === "lunch" ? "12:00:00" : "18:00:00"}`).getTime();
}

function getTopSlots(limit) {
  return state.slots
    .map((slot) => ({
      slotId: slot.id,
      count: state.users.reduce((total, user) => total + ((state.votes[user.id] || []).includes(slot.id) ? 1 : 0), 0),
    }))
    .sort((a, b) => slotDateValue(a.slotId) - slotDateValue(b.slotId) || b.count - a.count)
    .slice(0, limit);
}

function autoAssignTeams() {
  return tryBuildTeams(3) || tryBuildTeams(4) || { teamCount: 4, teams: [] };
}

function tryBuildTeams(targetTeamCount) {
  const submittedUsers = state.users.filter((user) => state.submissions[user.id] && (state.votes[user.id] || []).length > 0);
  if (!submittedUsers.length) {
    return { teamCount: targetTeamCount, teams: [] };
  }

  const minSize = Math.floor(submittedUsers.length / targetTeamCount);
  const maxSize = Math.ceil(submittedUsers.length / targetTeamCount);
  const orderedSlots = [...state.slots].sort((a, b) => slotDateValue(a.id) - slotDateValue(b.id));
  const unassigned = new Set(
    submittedUsers
      .slice()
      .sort((a, b) => submissionOrderValue(a.id) - submissionOrderValue(b.id))
      .map((user) => user.id)
  );
  const teams = [];

  for (const slot of orderedSlots) {
    if (teams.length >= targetTeamCount) {
      break;
    }

    const interested = Array.from(unassigned).filter((userId) => (state.votes[userId] || []).includes(slot.id));
    if (interested.length < minSize) {
      continue;
    }

    const members = interested
      .sort((a, b) => submissionOrderValue(a) - submissionOrderValue(b))
      .slice(0, maxSize);

    members.forEach((userId) => unassigned.delete(userId));

    teams.push({
      id: `team-${teams.length + 1}`,
      name: `${String.fromCharCode(65 + teams.length)}팀`,
      slotId: slot.id,
      memberIds: members,
    });
  }

  if (teams.length < targetTeamCount) {
    return null;
  }

  Array.from(unassigned)
    .sort((a, b) => submissionOrderValue(a) - submissionOrderValue(b))
    .forEach((userId) => {
      const preferredTeam = teams.find(
        (team) => team.memberIds.length < maxSize && (state.votes[userId] || []).includes(team.slotId)
      );
      const fallbackTeam = preferredTeam || teams.slice().sort((a, b) => a.memberIds.length - b.memberIds.length)[0];
      fallbackTeam.memberIds.push(userId);
    });

  return { teamCount: targetTeamCount, teams };
}

function submissionOrderValue(userId) {
  const submittedAt = state.submissions[userId]?.submittedAt;
  return submittedAt ? new Date(submittedAt).getTime() : Number.MAX_SAFE_INTEGER;
}

function assignmentScore() {
  if (!state.teams.length) {
    return { summary: "자동 편성 전" };
  }

  const assignedUserIds = state.teams.flatMap((team) => team.memberIds);
  const matched = state.teams.reduce((total, team) => {
    return total + team.memberIds.filter((memberId) => (state.votes[memberId] || []).includes(team.slotId)).length;
  }, 0);

  return {
    summary: `${state.activeTeamCount}팀 / 희망 일정 일치 ${matched}/${assignedUserIds.length}`,
  };
}

function renderTeamCard(team) {
  const matchedCount = team.memberIds.filter((memberId) => (state.votes[memberId] || []).includes(team.slotId)).length;

  return `
    <div class="assignment-card">
      <header>
        <div>
          <strong>${team.name}</strong>
          <div class="mini">${slotLabel(team.slotId)}</div>
        </div>
        <span>${team.memberIds.length}명</span>
      </header>
      <div class="mini">${matchedCount}명 희망 일정 일치 / 제출 순서 우선 반영</div>
      <div class="team-members">
        ${team.memberIds
          .map((memberId) => {
            const matched = (state.votes[memberId] || []).includes(team.slotId);
            return `<span class="member-chip ${matched ? "" : "mismatch"}">${userName(memberId)}</span>`;
          })
          .join("")}
      </div>
    </div>
  `;
}

function getCurrentUser() {
  return state.users.find((user) => user.id === state.currentUserId) || state.users[0];
}

function findAssignmentForUser(userId) {
  for (const team of state.teams) {
    if (team.memberIds.includes(userId)) {
      return { team, slotId: team.slotId };
    }
  }
  return null;
}

function slotLabel(slotId) {
  const slot = state.slots.find((entry) => entry.id === slotId);
  if (!slot) {
    return slotId;
  }
  return `${formatDate(slot.date)} ${slot.mealType === "lunch" ? "점심" : "저녁"}`;
}

function formatDate(dateString) {
  const date = new Date(`${dateString}T09:00:00`);
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function formatDateTime(isoString) {
  if (!isoString) {
    return "-";
  }
  const date = new Date(isoString);
  return `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, "0")}:${String(
    date.getMinutes()
  ).padStart(2, "0")}`;
}

function weekdayLabel(dateString) {
  const date = new Date(`${dateString}T09:00:00`);
  return ["일", "월", "화", "수", "목", "금", "토"][date.getDay()] + "요일";
}

function userName(userId) {
  return state.users.find((user) => user.id === userId)?.name || userId;
}
