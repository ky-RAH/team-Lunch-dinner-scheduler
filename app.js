const STORAGE_KEY = "team-dinner-scheduler-state-v3";
const ASSIGNMENTS_KEY = "__assignments__";

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
  "이재규",
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
  stateRowKey: "team-dinner-scheduler",
};

const appConfig = window.APP_CONFIG || {};
const heroStatsEl = document.getElementById("hero-stats");
const appEl = document.getElementById("app");

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
  backendMode: "loading",
  lastSyncedAt: null,
  loading: true,
  saving: false,
  dirty: false,
  error: "",
};

const dataStore = createDataStore();
initializeDefaultState();
init();

async function init() {
  const savedUserId = window.localStorage.getItem(`${STORAGE_KEY}:currentUserId`);
  if (savedUserId) {
    state.currentUserId = savedUserId;
  }

  render();

  try {
    const remoteState = await dataStore.load();
    hydrateState(remoteState);
    state.backendMode = dataStore.modeLabel;
    state.lastSyncedAt = new Date().toISOString();
  } catch (error) {
    state.error = error.message || "데이터를 불러오지 못했습니다.";
    state.backendMode = dataStore.modeLabel;
  } finally {
    state.loading = false;
    render();
  }
}

function initializeDefaultState() {
  TEAM_MEMBERS.forEach((user) => {
    state.votes[user.id] = [];
  });
  state.submissions = {};
}

function hydrateState(payload) {
  initializeDefaultState();
  state.votes = { ...state.votes, ...(payload.votes || {}) };
  state.submissions = payload.submissions || {};
  state.teams = payload.teams || [];
  state.activeTeamCount = payload.activeTeamCount || payload.teams?.length || 0;
}

function createEmptyPayload() {
  const votes = {};
  TEAM_MEMBERS.forEach((user) => {
    votes[user.id] = [];
  });
  return {
    votes,
    submissions: {},
    teams: [],
    activeTeamCount: 0,
  };
}

function createDataStore() {
  const supabaseUrl = appConfig.supabaseUrl;
  const supabaseAnonKey = appConfig.supabaseAnonKey;
  const tableName = appConfig.supabaseTable || "team_scheduler_state";

  if (supabaseUrl && supabaseAnonKey && window.supabase) {
    const client = window.supabase.createClient(supabaseUrl, supabaseAnonKey);

    return {
      modeLabel: "Supabase 공유 모드",
      async load() {
        const { data, error } = await client
          .from(tableName)
          .select("key, payload, updated_at");

        if (error) {
          throw new Error(`Supabase load failed: ${error.message}`);
        }

        const payload = createEmptyPayload();
        const rows = data || [];

        rows.forEach((row) => {
          if (row.key === ASSIGNMENTS_KEY) {
            payload.teams = row.payload?.teams || [];
            payload.activeTeamCount = row.payload?.activeTeamCount || payload.teams.length || 0;
            return;
          }

          if (payload.votes[row.key] !== undefined) {
            payload.votes[row.key] = row.payload?.slotIds || [];
            if (row.payload?.submittedAt || row.payload?.updatedAt) {
              payload.submissions[row.key] = {
                submittedAt: row.payload?.submittedAt || row.payload?.updatedAt,
                updatedAt: row.payload?.updatedAt || row.payload?.submittedAt,
              };
            }
          }
        });

        return payload;
      },
      async saveVote(userId, votePayload) {
        const { error } = await client.from(tableName).upsert(
          {
            key: userId,
            payload: votePayload,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "key" }
        );

        if (error) {
          throw new Error(`Supabase vote save failed: ${error.message}`);
        }
      },
      async saveAssignments(assignmentPayload) {
        const { error } = await client.from(tableName).upsert(
          {
            key: ASSIGNMENTS_KEY,
            payload: assignmentPayload,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "key" }
        );

        if (error) {
          throw new Error(`Supabase assignment save failed: ${error.message}`);
        }
      },
    };
  }

  return {
    modeLabel: "로컬 임시 모드",
    async load() {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : createEmptyPayload();
    },
    async saveVote(userId, votePayload) {
      const current = await this.load();
      current.votes[userId] = votePayload.slotIds || [];
      if (votePayload.submittedAt || votePayload.updatedAt) {
        current.submissions[userId] = {
          submittedAt: votePayload.submittedAt || votePayload.updatedAt,
          updatedAt: votePayload.updatedAt || votePayload.submittedAt,
        };
      } else {
        delete current.submissions[userId];
      }
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
    },
    async saveAssignments(assignmentPayload) {
      const current = await this.load();
      current.teams = assignmentPayload.teams || [];
      current.activeTeamCount = assignmentPayload.activeTeamCount || current.teams.length || 0;
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
    },
  };
}

async function syncCurrentVote(showSuccess) {
  state.saving = true;
  state.error = "";
  render();

  try {
    const submission = state.submissions[state.currentUserId];
    state.teams = [];
    state.activeTeamCount = 0;
    await dataStore.saveVote(state.currentUserId, {
      slotIds: state.votes[state.currentUserId] || [],
      submittedAt: submission?.submittedAt || null,
      updatedAt: submission?.updatedAt || null,
      name: getCurrentUser().name,
    });
    await dataStore.saveAssignments({
      teams: [],
      activeTeamCount: 0,
    });
    await reloadSharedState(true);
    state.lastSyncedAt = new Date().toISOString();
    state.dirty = false;
    if (showSuccess) {
      window.alert("저장되었습니다.");
    }
  } catch (error) {
    state.error = error.message || "저장에 실패했습니다.";
  } finally {
    state.saving = false;
    render();
  }
}

async function reloadSharedState(skipLoadingUi = false) {
  if (!skipLoadingUi) {
    state.loading = true;
    state.error = "";
    render();
  }
  try {
    const remoteState = await dataStore.load();
    hydrateState(remoteState);
    state.lastSyncedAt = new Date().toISOString();
    state.dirty = false;
  } catch (error) {
    state.error = error.message || "새로고침에 실패했습니다.";
  } finally {
    if (!skipLoadingUi) {
      state.loading = false;
    }
    render();
  }
}

async function syncAssignments(showSuccess) {
  state.saving = true;
  state.error = "";
  render();

  try {
    await dataStore.saveAssignments({
      teams: state.teams,
      activeTeamCount: state.activeTeamCount,
    });
    await reloadSharedState(true);
    state.lastSyncedAt = new Date().toISOString();
    state.dirty = false;
    if (showSuccess) {
      window.alert("저장되었습니다.");
    }
  } catch (error) {
    state.error = error.message || "편성 저장에 실패했습니다.";
  } finally {
    state.saving = false;
    render();
  }
}

function render() {
  renderHeroStats();

  if (state.loading) {
    appEl.innerHTML = `
      <section class="panel">
        <h2>데이터 불러오는 중</h2>
        <p class="muted">공용 저장소 연결 상태를 확인하고 있습니다.</p>
      </section>
    `;
    return;
  }

  appEl.innerHTML = `
    ${renderViewToggle()}
    ${renderStatusPanel()}
    ${renderVoteSection()}
    ${renderAssignmentSection()}
    ${renderManualSection()}
    <section class="footer-note">
      자동편성 규칙: 빠른 날짜 우선, 같은 슬롯 내 먼저 저장한 순서 우선, 3팀 우선 시도 후 실패 시 4팀으로 확장합니다.
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
    statCard("저장 모드", state.backendMode === "loading" ? "-" : state.backendMode),
  ].join("");
}

function renderStatusPanel() {
  return `
    <section class="panel">
      <div class="panel-header">
        <div>
          <h2>저장 상태</h2>
          <p class="muted">팀원 투표를 모아서 편성하려면 반드시 공용 저장 모드가 필요합니다.</p>
        </div>
        <div class="inline-controls">
          <button class="ghost" id="refresh-shared">공용 데이터 새로고침</button>
        </div>
      </div>
      <div class="summary-grid">
        <div class="summary-row">
          <strong>현재 모드</strong>
          <span>${state.backendMode}</span>
        </div>
        <div class="summary-row">
          <strong>마지막 동기화</strong>
          <span>${state.lastSyncedAt ? formatDateTime(state.lastSyncedAt) : "없음"}</span>
        </div>
        <div class="summary-row">
          <strong>변경 상태</strong>
          <span>${state.dirty ? "저장 필요" : "동기화됨"}</span>
        </div>
      </div>
      ${
        state.backendMode !== "Supabase 공유 모드"
          ? `
            <p class="warning" style="margin-top:16px">
              지금은 브라우저별 로컬 저장이라 팀원끼리 데이터가 공유되지 않습니다. config.js에 Supabase 정보를 넣어야 실제 운영이 가능합니다.
            </p>
          `
          : ""
      }
      ${state.error ? `<p class="warning" style="margin-top:12px">${state.error}</p>` : ""}
    </section>
  `;
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
          <p class="muted">팀원은 이름을 선택한 뒤 희망 슬롯을 체크하고 저장합니다.</p>
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
          <button class="primary" id="save-vote" ${state.saving ? "disabled" : ""}>${state.saving ? "저장 중..." : "투표 저장"}</button>
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
  const unassignedUsers = getUnassignedSubmittedUsers();

  return `
    <section class="panel" style="${state.currentView === "assignment" ? "" : "display:none"}">
      <div class="panel-header">
        <div>
          <h2>자동편성</h2>
          <p class="muted">편성 결과를 먼저 보여주고 아래에서 현재까지 쌓인 데이터를 확인합니다.</p>
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
            <p class="muted">빠른 날짜순으로 2인 이상 모인 슬롯을 팀으로 인정하고, 최대 4개 팀까지 만듭니다.</p>
          </div>
          <span class="tag ${unassignedUsers.length ? "danger-tag" : ""}">
            ${score.summary}${unassignedUsers.length ? ` / 미배정 ${unassignedUsers.map((user) => user.name).join(", ")}` : ""}
          </span>
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
                      const voteText = (state.votes[user.id] || []).length
                        ? (state.votes[user.id] || []).map((slotId) => slotLabel(slotId)).join(", ")
                        : "투표 없음";
                      return `
                        <div class="person-row">
                          <div>
                            <strong>${user.name}</strong>
                            <div class="mini">
                              ${
                                assignment
                                  ? `<span class="team-badge team-${assignment.team.id}">${assignment.team.name}</span> ${slotLabel(assignment.slotId)}`
                                  : '<span class="team-badge team-unassigned">미배정</span>'
                              }
                            </div>
                            <div class="mini subtle-votes">희망 일정: ${voteText}</div>
                          </div>
                          <div class="mini">
                            ${
                              assignment
                                ? `<span class="team-badge team-${assignment.team.id}">${assignment.team.name}</span>`
                                : '<span class="team-badge team-unassigned">미배정</span>'
                            }
                          </div>
                        </div>
                      `;
                    })
                    .join("")}
                </div>
              </div>
              <div class="panel" style="margin-top:18px">
                <h3>미배정 인원</h3>
                ${
                  unassignedUsers.length
                    ? `
                      <p class="mini">2인 이상 같은 슬롯이 형성되지 않아 아직 팀으로 묶이지 않은 인원입니다.</p>
                      <div class="chips">${unassignedUsers.map((user) => `<span class="member-chip mismatch">${user.name}</span>`).join("")}</div>
                    `
                    : '<p class="mini">미배정 인원이 없습니다.</p>'
                }
              </div>
            `
            : '<p class="mini">아직 편성 결과가 없습니다. 투표 저장 후 자동 편성 실행을 눌러 주세요.</p>'
        }
      </div>

      <div class="admin-layout" style="margin-top:18px">
        <div class="panel">
          <h3>빠른 날짜 순 인기 일정</h3>
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
          <p class="muted">자동 편성 뒤 인원을 수동으로 이동할 수 있습니다.</p>
        </div>
        <div class="inline-controls">
          <button class="ghost" id="save-manual" ${state.saving ? "disabled" : ""}>수동 조정 저장</button>
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

  const refreshButton = document.getElementById("refresh-shared");
  if (refreshButton) {
    refreshButton.addEventListener("click", () => {
      reloadSharedState();
    });
  }
}

function bindVoteEvents() {
  const select = document.getElementById("user-select");
  if (select) {
    select.addEventListener("change", (event) => {
      state.currentUserId = event.target.value;
      window.localStorage.setItem(`${STORAGE_KEY}:currentUserId`, state.currentUserId);
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
      state.dirty = true;
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
      state.dirty = true;
      render();
    });
  });

  const saveButton = document.getElementById("save-vote");
  if (saveButton) {
    saveButton.addEventListener("click", async () => {
      const now = new Date().toISOString();
      const previous = state.submissions[state.currentUserId];
      state.submissions[state.currentUserId] = {
        submittedAt: previous?.submittedAt || now,
        updatedAt: now,
      };
      await syncCurrentVote(true);
    });
  }

  const clearButton = document.getElementById("clear-vote");
  if (clearButton) {
    clearButton.addEventListener("click", async () => {
      state.votes[state.currentUserId] = [];
      delete state.submissions[state.currentUserId];
      state.teams = [];
      state.dirty = true;
      await syncCurrentVote(false);
    });
  }
}

function bindAssignmentEvents() {
  const autoAssignButton = document.getElementById("auto-assign");
  if (autoAssignButton) {
    autoAssignButton.addEventListener("click", async () => {
      const result = autoAssignTeams();
      state.teams = result.teams;
      state.activeTeamCount = result.teamCount;
      state.dirty = true;
      await syncAssignments(false);
    });
  }

  const resetButton = document.getElementById("reset-teams");
  if (resetButton) {
    resetButton.addEventListener("click", async () => {
      state.teams = [];
      state.activeTeamCount = 0;
      state.selectedUserId = null;
      state.dirty = true;
      await syncAssignments(false);
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
      state.dirty = true;
      render();
    });
  });

  const saveManualButton = document.getElementById("save-manual");
  if (saveManualButton) {
    saveManualButton.addEventListener("click", async () => {
      await syncAssignments(true);
    });
  }
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
  const submittedUsers = state.users.filter((user) => state.submissions[user.id] && (state.votes[user.id] || []).length > 0);
  if (!submittedUsers.length) {
    return { teamCount: 0, teams: [] };
  }

  const orderedSlots = [...state.slots].sort((a, b) => slotDateValue(a.id) - slotDateValue(b.id));
  const unassigned = new Set(
    submittedUsers
      .slice()
      .sort((a, b) => submissionOrderValue(a.id) - submissionOrderValue(b.id))
      .map((user) => user.id)
  );
  const teams = [];

  for (const slot of orderedSlots) {
    if (teams.length >= 4) {
      break;
    }

    const interested = Array.from(unassigned).filter((userId) => (state.votes[userId] || []).includes(slot.id));
    if (interested.length < 2) {
      continue;
    }

    const members = interested
      .sort((a, b) => submissionOrderValue(a) - submissionOrderValue(b))
      .slice();

    members.forEach((userId) => unassigned.delete(userId));

    teams.push({
      id: `team-${teams.length + 1}`,
      name: `${String.fromCharCode(65 + teams.length)}팀`,
      slotId: slot.id,
      memberIds: members,
    });
  }

  return { teamCount: teams.length, teams };
}

function submissionOrderValue(userId) {
  const submittedAt = state.submissions[userId]?.submittedAt;
  return submittedAt ? new Date(submittedAt).getTime() : Number.MAX_SAFE_INTEGER;
}

function assignmentScore() {
  if (!state.teams.length) {
    return { summary: "자동 편성 전" };
  }

  const submittedUsers = state.users.filter((user) => state.submissions[user.id] && (state.votes[user.id] || []).length > 0);
  const assignedUserIds = state.teams.flatMap((team) => team.memberIds);
  const matched = state.teams.reduce((total, team) => {
    return total + team.memberIds.filter((memberId) => (state.votes[memberId] || []).includes(team.slotId)).length;
  }, 0);

  return {
    summary: `${state.activeTeamCount}팀 생성 / 배정 ${assignedUserIds.length}/${submittedUsers.length}명 / 희망 일정 일치 ${matched}/${assignedUserIds.length}`,
  };
}

function getUnassignedSubmittedUsers() {
  const assignedIds = new Set(state.teams.flatMap((team) => team.memberIds));
  return state.users.filter((user) => state.submissions[user.id] && !assignedIds.has(user.id));
}

function renderTeamCard(team) {
  const matchedCount = team.memberIds.filter((memberId) => (state.votes[memberId] || []).includes(team.slotId)).length;

  return `
    <div class="assignment-card team-card-${team.id}">
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
