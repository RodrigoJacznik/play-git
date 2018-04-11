const s = Snap('#svg');

const arrow = s.polygon([0, 10, 4, 10, 2, 0, 0, 10])
    .attr({ fill: '#323232' })
    .transform('r-90');

const marker = arrow.marker(0, 0, 10, 10, 0, 5);

function makeBranch(options) {
    let x, y;

    if (options.from) {
        x = options.from.nextCommit;
        y = options.from.y + 100 + (options.yExtra || 0);
    } else {
        x = options.x;
        y = options.y;
    }

    const text = s.text(x, y + 3, options.name);

    const lifeline = s.line(x + 70, y, x + 130, y)
        .attr({
            stroke: options.color,
            strokeWidth: 2,
            strokeDasharray: 5
        });

    const branch = {
        name: options.name,
        x: x + 70,
        y,
        nextCommit: x + 50,
        color: options.color,
        lifeline,
        commits: [],
        branches: [],
        text,
        commit: makeCommit,
        merge,
        deactive: function () {
            this.text.attr({
                fill: '#000',
                fontWeight: 100
            })
        },
        active: function () {
            this.text.attr({
                fill: 'green',
                fontWeight: 'bold'
            });
        },
        branch: function (options) {
            let yExtra;

            // es un hotfix
            if (this.name === 'master' && options.name !== 'dev') {
                yExtra = -35;
            } else {
                yExtra = this.branches.length > 0
                    ? this.branches.length * 70 
                    : 0;
            }

            const b = makeBranch(Object.assign(
                {},
                { from: this, yExtra },
                options
            ));

            s.line(
                this.nextCommit,
                this.y,
                b.x + 30,
                b.y
            ).attr({
                stroke: '#000',
                strokeWidth: 2,
                markerStart: marker
            });

            return b;
        }
    }

    return branch;
}

function makeCommit(x) {
    if (x) {
        this.nextCommit = x + 50;
    } else {
        this.nextCommit += 50;
    }

    this.lifeline.attr({ x2: this.nextCommit + 30 });

    s.circle(this.nextCommit, this.y, 10)
        .attr({
            fill: this.color,
            stroke: "#000",
            strokeWidth: 2
        });

    const commit = {
        x: this.nextCommit,
        y: this.y
    };

    const idx = this.commits.push(commit);

    if (idx > 1) {
        s.line(
            this.commits[idx - 2].x + 10,
            this.y,
            commit.x - 10,
            this.y
        ).attr({
            stroke: "#000",
            strokeWidth: 2,
            markerStart: marker
        })
    }

    return commit;
}

function merge(to) {
    const lastCommitToBranch = to.commits[to.commits.length - 1];
    const lastCommitFromBranch = this.commits[this.commits.length - 1];

    const x = lastCommitToBranch.x > lastCommitFromBranch.x
        ? lastCommitToBranch.x
        : undefined;

    const mergeCommit = this.commit(x);

    s.line(
        lastCommitToBranch.x,
        lastCommitToBranch.y,
        mergeCommit.x,
        mergeCommit.y
    ).attr({
        stroke: '#000',
        strokeWidth: 2,
        markerStart: marker
    });
}

const state = {
    lastCommand: undefined,
    head: undefined,
    _selectedBranch: null,

    get selectedBranch() {
        return this._selectedBranch
    },
    set selectedBranch(branch) {
        if (this._selectedBranch) {
            this._selectedBranch.deactive();
        }
        this._selectedBranch = branch;
        this._selectedBranch.active();
    },

    branches: {}
}

const COLORS = {
    feature: 'violet',
    master: 'green',
    hotfix: 'red',
    dev: 'blue'
}

function getColor(name) {
    return Object.keys(COLORS).reduce((value, color) => {
            if (name.includes(color)) {
                return COLORS[color];
            }

            return value;
        }, '');
}

const commands = {
    init: function () {
        state.branches.master = makeBranch({
            name: 'master',
            x: 30,
            y: 30,
            color: COLORS.master
        });

        state.selectedBranch = state.branches.master;
        return 'Initialized empty Git repository';
    },

    commit: function () {
        if (!state.selectedBranch) {
            throw new Error("fatal: not a git repository (or any parent up to mount point /)\n Stopping at filesystem boundary (GIT_DISCOVERY_ACROSS_FILESYSTEM not set).");
        }
        state.selectedBranch.commit();
    },

    branch: function (name) {
        if (!name) {
            const activeBranch = state.selectedBranch;
            return Object.keys(state.branches)
                .map(function (bname) {
                    if (activeBranch.name === bname) {
                        return `<span class="active">*   ${bname}</span>`;
                    }

                    return `<span>    ${bname}</span>`;
                })
                .join('\n');
        }

        state.branches[name] = state.selectedBranch.branch({
            name,
            color: getColor(name)
        });
    },

    checkout: function (name) {
        state.selectedBranch = state.branches[name];
        return `Switched to branch '${name}'`
    },

    'checkout -b': function (name) {
        this.branch(name);
        return this.checkout(name);
    },

    merge: function (to) {
        state.selectedBranch.merge(state.branches[to]);
    },

    help: function () {
        return `Commands aviables:
            - help
            - clear
            - git init
            - git checkout
            - git checkout -b
            - git commit
            - git branch
            - git merge
        `;
    },

    clear: function () {
        $history.innerHTML = '';
    }
}

// Checkout -b no es la forma mas linda pero funciona
const commandRe = /git\s*(init|checkout -b|checkout|commit|branch|merge|help)\s*(\w*)/;

const $history = document.querySelector('.history');

const $command = document.querySelector('#command')
    .addEventListener('keydown', function (e) {
        if (e.key === 'ArrowUp') {
            e.target.value = state.lastCommand;
        }
        if (e.key === 'Enter') {
            const val = e.target.value.trim();

            if (!val) { return ; }

            state.lastCommand = val
            runCommand(val);

            e.target.value = '';
        }
    });

function runCommand(val) {
    if (val === 'help' || val === 'clear') {
        runUtility(val);
    } else {
        runGitCommand(val);
    }
}

function runGitCommand(val) {
    const [_, command, arg] = commandRe.exec(val) || [];
    let result;

    try {
        result = commands[command](arg);
    } catch (e) {
        if (e instanceof TypeError) {
            result = `Is not implmented or is not a git command. See 'help'.`
        } else {
            result = e.message;
        }
    }

    addEntry(`${val}`.trim(), result);
}

function runUtility(val) {
    const result = commands[val]()

    if (val === 'help') {
        addEntry(val, result);
    }
}

function addEntry(command, result) {
    const $historyEntry = document.createElement('div');
    let output = `<pre>$  ${command}</pre>`;

    $historyEntry.classList.add('history-entry');

    if (result) {
        output += `<pre>${result}</pre>`;
    }

    $historyEntry.innerHTML = output;
    $history.append($historyEntry);
    $history.scrollTo({
        top: $history.scrollHeight,
        behavior: 'smooth'
    });
}

runUtility('help');
