export type TaskStatus = "idle" | "inprogress" | "done";

export interface Task {
	id: number;
	text: string;
	status: TaskStatus;
}

export interface TillDoneState {
	tasks: Task[];
	nextId: number;
	listTitle?: string;
	listDescription?: string;
}

export const STATUS_ICON: Record<TaskStatus, string> = {
	idle: "○",
	inprogress: "●",
	done: "✓",
};

export const NEXT_STATUS: Record<TaskStatus, TaskStatus> = {
	idle: "inprogress",
	inprogress: "done",
	done: "idle",
};

export function createState(): TillDoneState {
	return { tasks: [], nextId: 1 };
}
