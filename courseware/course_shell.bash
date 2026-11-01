# Interactive Bash only. Fixed classroom operations; no history or command logging.
[[ $- == *i* ]] || return 0
__pi_helper_root=$HOME
function __pi_helper_report {
    command /usr/bin/python3 "$__pi_helper_root/.local/share/pi-helper-course/pi_course.py" observe "$@" >/dev/null 2>&1 ||
        printf '%s\n' '指令已執行，但操作回報未記錄，請找助教。' >&2
    return 0
}
__pi_helper_conflict=0
for __pi_helper_name in mkdir cd ls pwd hostname; do
    if declare -F "$__pi_helper_name" >/dev/null && [[ ${__pi_helper_loaded:-0} != 1 ]]; then
        __pi_helper_conflict=1
    fi
done
if [[ $__pi_helper_conflict == 1 ]]; then
    __pi_helper_report terminal_ready 0 "$PWD" 0
    printf '%s\n' '課程指令回報未啟用：終端機已有自訂指令，請找助教。' >&2
    return 0
fi
function mkdir {
    local __pi_rc=0 __pi_existed=0
    [[ -d "$__pi_helper_root/pi-camera/photos" ]] && __pi_existed=1
    command mkdir "$@" || __pi_rc=$?
    if [[ $# == 2 && $1 == -p && $2 == "$__pi_helper_root/pi-camera/photos" ]]; then
        __pi_helper_report mkdir_photos "$__pi_rc" "$PWD" "$__pi_existed"
    fi
    return "$__pi_rc"
}
function cd {
    local __pi_rc=0 __pi_target=${1-}
    [[ $# == 2 && $1 == -- ]] && __pi_target=$2
    builtin cd "$@" || __pi_rc=$?
    if [[ ( $# == 1 || ( $# == 2 && $1 == -- ) ) && $__pi_target == "$__pi_helper_root/pi-camera" ]]; then
        __pi_helper_report enter_project "$__pi_rc" "$PWD" 0
    fi
    return "$__pi_rc"
}
function ls {
    local __pi_rc=0 __pi_supported=1 __pi_arg
    for __pi_arg in "$@"; do
        case "$__pi_arg" in
            --color=auto|--color=always|--color=never) ;;
            -*) [[ -z ${__pi_arg#-} || ${__pi_arg#-} == *[!alAhF1]* ]] && __pi_supported=0 ;;
            *) __pi_supported=0 ;;
        esac
    done
    command ls "$@" || __pi_rc=$?
    if [[ $PWD == "$__pi_helper_root/pi-camera" && $__pi_supported == 1 ]]; then
        __pi_helper_report list_project "$__pi_rc" "$PWD" 0
    fi
    return "$__pi_rc"
}
function pwd {
    local __pi_rc=0
    builtin pwd "$@" || __pi_rc=$?
    if [[ $# == 0 ]]; then __pi_helper_report working_dir "$__pi_rc" "$PWD" 0; fi
    return "$__pi_rc"
}
function hostname {
    local __pi_rc=0
    command hostname "$@" || __pi_rc=$?
    if [[ $# == 0 ]]; then __pi_helper_report host_name "$__pi_rc" "$PWD" 0; fi
    return "$__pi_rc"
}
__pi_helper_loaded=1
__pi_helper_report terminal_ready 0 "$PWD" 1
