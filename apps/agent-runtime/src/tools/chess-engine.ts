import { Type } from '@earendil-works/pi-ai';
import type { AgentTool } from '@earendil-works/pi-agent-core';
import type { TextContent } from '@earendil-works/pi-ai';
import { logger } from '@repo/utils';
import { Chess } from 'chess.js';
import { ai as engineAi } from 'js-chess-engine';
import type { ToolContext } from './types.js';

/**
 * chess_engine — Pick the next chess move with a real engine, never the LLM.
 *
 * This tool is the ONLY sanctioned source of chess moves for the agent. The
 * agent must use it exclusively for playing chess and must relay the engine's
 * move verbatim — it must never invent or reason out a move on its own.
 *
 * The tool is stateless: each call receives the full move history (in SAN, from
 * the opening move) and the chosen difficulty. chess.js replays and validates
 * the history and produces authoritative SAN/FEN/status; js-chess-engine selects
 * the reply move for the side to move.
 *
 * Levels match js-chess-engine's official 1–5 difficulty aliases:
 *   beginner → 1, easy → 2, intermediate → 3 (default), advanced → 4, expert → 5
 */
type ChessLevel = 'beginner' | 'easy' | 'intermediate' | 'advanced' | 'expert';

const LEVEL_MAP: Record<ChessLevel, number> = {
	beginner: 1,
	easy: 2,
	intermediate: 3,
	advanced: 4,
	expert: 5,
};

type PieceColor = 'w' | 'b';
type PieceType = 'p' | 'n' | 'b' | 'r' | 'q' | 'k';

/** Unicode glyphs: outlined = White, filled = Black. */
const GLYPH: Record<PieceColor, Record<PieceType, string>> = {
	w: { k: '♔', q: '♕', r: '♖', b: '♗', n: '♘', p: '♙' },
	b: { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' },
};

/** Render the board as a compact text diagram (rank 8 at top, files a–h). */
function renderBoard(chess: Chess): string {
	const lines = chess.board().map((row, r) => {
		const cells = row.map((sq) => (sq ? GLYPH[sq.color][sq.type] : '·'));
		return `${8 - r} ${cells.join(' ')}`;
	});
	lines.push('  a b c d e f g h');
	return lines.join('\n');
}

/** Format SAN history as a single line, e.g. "1. d4 Nf6 · 2. c4 g6 · 3. Nc3". */
function formatHistory(moves: string[]): string {
	if (moves.length === 0) return '(no moves yet)';
	const groups: string[] = [];
	for (let i = 0; i < moves.length; i += 2) {
		const black = moves[i + 1];
		groups.push(`${i / 2 + 1}. ${moves[i]}${black ? ` ${black}` : ''}`);
	}
	return groups.join(' · ');
}

/** Describe the current game state in plain words for the agent to relay. */
function describeStatus(chess: Chess): string {
	if (chess.isCheckmate()) {
		// The side to move is checkmated → the side that just moved won.
		const winner = chess.turn() === 'w' ? 'Black' : 'White';
		return `Checkmate — ${winner} wins.`;
	}
	if (chess.isStalemate()) return 'Draw — stalemate.';
	if (chess.isInsufficientMaterial()) return 'Draw — insufficient material.';
	if (chess.isThreefoldRepetition()) return 'Draw — threefold repetition.';
	if (chess.isDraw()) return 'Draw.';
	if (chess.isCheck()) return `Check — ${chess.turn() === 'w' ? 'White' : 'Black'} to move.`;
	return `${chess.turn() === 'w' ? 'White' : 'Black'} to move.`;
}

export function createChessEngineTool(ctx: ToolContext): AgentTool {
	void ctx; // No host dependencies — move selection is purely local computation.

	const tool: AgentTool = {
		name: 'chess_engine',
		label: 'Chess Engine',
		description:
			'Select the next chess move using a real chess engine. This tool is the ONLY ' +
			'allowed source of chess moves — use it EXCLUSIVELY for playing chess and for nothing ' +
			'else. You must NEVER invent, guess, or reason out a chess move yourself: every move you ' +
			'state to the user must be the exact "engineMove" returned by this tool, copied verbatim. ' +
			'Before the first move of a new game, you MUST call ask_human to let the user pick a ' +
			'difficulty level (beginner, easy, intermediate, advanced, or expert) and confirm which ' +
			'color they play. On every turn, pass the COMPLETE move history so far in standard ' +
			'algebraic notation (SAN), in order from the opening move, and the chosen level; the ' +
			'tool returns the engine’s reply move for the side to move. Interpreting the user’s ' +
			'spoken move into SAN before adding it to the history is fine, but the move the engine ' +
			'plays must always come from this tool. Do NOT write chess moves or game progress to ' +
			'long-term memory (memory_write) — the move history is already in the conversation ' +
			'thread, so reconstruct it from there each turn rather than memorizing it. Important: ' +
			'do not judge, evaluate, praise, or criticize any move, and do not tell the user what ' +
			'move they should play or give them advice — just play your move and present the ' +
			'position. Still show the board diagram and move list the tool returns.',
		parameters: Type.Object({
			moves: Type.Array(Type.String(), {
				description:
					'The complete game history so far in standard algebraic notation (SAN), in order ' +
					'from the very first move (e.g. ["d4", "Nf6", "Nc3"]). Pass an empty array to let ' +
					'the engine play the opening move as White.',
			}),
			level: Type.Union(
				[
					Type.Literal('beginner'),
					Type.Literal('easy'),
					Type.Literal('intermediate'),
					Type.Literal('advanced'),
					Type.Literal('expert'),
				],
				{
					description:
						'Difficulty level the user chose: "beginner" (weakest, 1-ply lookahead), "easy", ' +
						'"intermediate" (default), "advanced", or "expert" (strongest, deepest search). ' +
						'Pass the level the user selected via ask_human.',
				},
			),
			startFen: Type.Optional(
				Type.String({
					description:
						'Optional starting position in FEN notation. Omit for a standard new game. ' +
						'When provided, "moves" are replayed from this position.',
				}),
			),
		}),
		execute: async (_toolCallId, params) => {
			const { moves, level, startFen } = params as {
				moves: string[];
				level: ChessLevel;
				startFen?: string;
			};

			// 1. Build the board and replay the supplied history (validates legality).
			let chess: Chess;
			try {
				chess = startFen ? new Chess(startFen) : new Chess();
			} catch {
				const text: TextContent = {
					type: 'text',
					text: `Invalid starting position (FEN): ${startFen ?? ''}. Provide a valid FEN or omit it.`,
				};
				return { content: [text], details: { error: 'invalid_fen' } };
			}

			for (const san of moves) {
				try {
					chess.move(san);
				} catch {
					const text: TextContent = {
						type: 'text',
						text:
							`Illegal or unparseable move in history: "${san}". ` +
							'Provide the full move history in valid standard algebraic notation (SAN).',
					};
					return { content: [text], details: { error: 'illegal_move', move: san } };
				}
			}

			// 2. If the game is already over, there is no move to make.
			if (chess.isGameOver()) {
				const status = describeStatus(chess);
				const text: TextContent = {
					type: 'text',
					text:
						`The game is already over. ${status}\n\n` +
						'```\n' +
						renderBoard(chess) +
						'\n```\n\n' +
						`moves: ${formatHistory(moves)}`,
				};
				return {
					content: [text],
					details: { gameOver: true, status, fen: chess.fen() },
				};
			}

			// 3. Ask the engine for the side-to-move's reply, then apply it via chess.js
			//    so we can report it in SAN and recompute authoritative status.
			const engineLevel = LEVEL_MAP[level];
			const result = engineAi(chess.fen(), { level: engineLevel, play: false });
			const entry = Object.entries(result.move)[0];
			if (!entry) {
				const text: TextContent = {
					type: 'text',
					text: 'The engine returned no move for this position.',
				};
				return { content: [text], details: { error: 'no_move', fen: chess.fen() } };
			}

			const [from, to] = entry;
			const played = chess.move({
				from: from.toLowerCase(),
				to: to.toLowerCase(),
				promotion: 'q',
			});

			const status = describeStatus(chess);
			const fen = chess.fen();
			const gameOver = chess.isGameOver();

			logger.info(
				{ level, ply: moves.length, engineMove: played.san, gameOver },
				'[agent-runner] chess_engine move',
			);

			const text: TextContent = {
				type: 'text',
				text:
					`engineMove: ${played.san}\n\n` +
					'```\n' +
					renderBoard(chess) +
					'\n```\n\n' +
					`moves: ${formatHistory([...moves, played.san])}\n` +
					`status: ${status}\n\n` +
					'Relay engineMove to the user exactly as shown, and show the board diagram and ' +
					'the move list above. Keep the move list on ONE line — do NOT reformat it into a ' +
					'multi-line list or table.',
			};
			return {
				content: [text],
				details: { engineMove: played.san, status, fen, gameOver },
			};
		},
	};

	return tool;
}
