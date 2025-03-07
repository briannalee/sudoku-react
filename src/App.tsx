import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast, Toaster } from "sonner";
import * as Tone from "tone";
import {
  Trash2,
  RefreshCw,
  Lightbulb,
  Clock,
  CheckCircle,
  Trophy,
  Volume2,
  VolumeX,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

interface Cell {
  row: number;
  col: number;
  value: number | null;
}

const SudokuGame = () => {
  // Board state
  const [initialBoard, setInitialBoard] = useState<number[][]>(
    Array(9)
      .fill(null)
      .map(() => Array(9).fill(0))
  );
  const [board, setBoard] = useState<Cell[][]>(
    Array(9)
      .fill(null)
      .map((_, rowIndex) =>
        Array(9)
          .fill(null)
          .map((_, colIndex) => ({
            row: rowIndex,
            col: colIndex,
            value: null,
          }))
      )
  );

  // Game state
  const [selectedCell, setSelectedCell] = useState<Cell | null>(null);
  const [difficulty, setDifficulty] = useState<
    "easy" | "medium" | "hard" | "expert"
  >("medium");
  const [timer, setTimer] = useState(0);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [showVictoryDialog, setShowVictoryDialog] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);

  // Timer interval ref
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Sound synths
  const clickSynth = useRef<Tone.Synth | null>(null);
  const successSynth = useRef<Tone.PolySynth | null>(null);
  const errorSynth = useRef<Tone.Synth | null>(null);

  // Initialize audio
  useEffect(() => {
    clickSynth.current = new Tone.Synth({
      oscillator: { type: "sine" },
      envelope: { attack: 0.01, decay: 0.1, sustain: 0, release: 0.1 },
    }).toDestination();

    successSynth.current = new Tone.PolySynth(Tone.Synth).toDestination();

    errorSynth.current = new Tone.Synth({
      oscillator: { type: "sawtooth" },
      envelope: { attack: 0.01, decay: 0.2, sustain: 0, release: 0.2 },
    }).toDestination();

    return () => {
      clickSynth.current?.dispose();
      successSynth.current?.dispose();
      errorSynth.current?.dispose();
    };
  }, []);

  const playSuccessSound = useCallback(() => {
    if (soundEnabled && successSynth.current) {
      successSynth.current.triggerAttackRelease(["C4", "E4", "G4", "C5"], "8n");
    }
  }, [soundEnabled]);

  const playErrorSound = useCallback(() => {
    if (soundEnabled && errorSynth.current) {
      errorSynth.current.triggerAttackRelease("A3", "16n");
    }
  }, [soundEnabled]);

  // Timer management
  useEffect(() => {
    if (isTimerRunning) {
      timerRef.current = setInterval(() => {
        setTimer((prev) => prev + 1);
      }, 1000);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [isTimerRunning]);

  // Initialize the board with a new puzzle
  useEffect(() => {
    toast.dismiss(); // Dismiss any existing toasts
    generateNewPuzzle();
  }, [difficulty]);

  // Function to format timer
  const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes.toString().padStart(2, "0")}:${remainingSeconds
      .toString()
      .padStart(2, "0")}`;
  };

  // Function to generate a new Sudoku puzzle
  const generateNewPuzzle = useCallback(() => {
    setTimer(0);
    setShowVictoryDialog(false);

    // Start with an empty board (all zeros)
    const emptyBoard: number[][] = Array(9)
      .fill(null)
      .map(() => Array(9).fill(0));

    // Fill the board with a valid Sudoku solution
    fillSudoku(emptyBoard);

    // Remove numbers to create the puzzle based on difficulty
    let cellsToRemove = 45; // medium default

    switch (difficulty) {
      case "easy":
        cellsToRemove = 35;
        break;
      case "medium":
        cellsToRemove = 45;
        break;
      case "hard":
        cellsToRemove = 55;
        break;
      case "expert":
        cellsToRemove = 60;
        break;
    }

    const puzzleBoard = createPuzzle(emptyBoard, cellsToRemove);

    // Store the initial board for validation later
    setInitialBoard(puzzleBoard);

    // Convert the puzzle board to the Cell format for the game state
    const initialCells: Cell[][] = puzzleBoard.map((row, rowIndex) =>
      row.map((value, colIndex) => ({
        row: rowIndex,
        col: colIndex,
        value: value === 0 ? null : value,
      }))
    );

    setBoard(initialCells);
    setIsTimerRunning(true);

    toast.success("New Game Started", {
      description: `${
        difficulty.charAt(0).toUpperCase() + difficulty.slice(1)
      } difficulty puzzle generated. Good luck!`,
    });
  }, [difficulty]);

  // Function to fill the Sudoku board with a valid solution using backtracking
  const fillSudoku = (board: number[][]) => {
    const findEmptyCell = (): [number, number] | null => {
      for (let row = 0; row < 9; row++) {
        for (let col = 0; col < 9; col++) {
          if (board[row][col] === 0) {
            return [row, col];
          }
        }
      }
      return null;
    };

    const isEmptyCell = findEmptyCell();
    if (!isEmptyCell) {
      return true; // Board is full, puzzle is solved
    }

    const [row, col] = isEmptyCell;

    const numbers = shuffle(Array.from({ length: 9 }, (_, i) => i + 1)); // Shuffle numbers 1-9

    for (const num of numbers) {
      if (isValid(board, row, col, num)) {
        board[row][col] = num;

        if (fillSudoku(board)) {
          return true; // Continue filling the board
        }

        board[row][col] = 0; // Backtrack
      }
    }

    return false; // No valid number found, need to backtrack
  };

  // Function to create a Sudoku puzzle by removing numbers from a solved board
  const createPuzzle = (
    solvedBoard: number[][],
    numbersToRemove: number
  ): number[][] => {
    const puzzle = solvedBoard.map((row) => [...row]); // Create a copy
    let attempts = numbersToRemove;

    while (attempts > 0) {
      const row = Math.floor(Math.random() * 9);
      const col = Math.floor(Math.random() * 9);

      if (puzzle[row][col] !== 0) {
        puzzle[row][col] = 0; // Remove the number
        attempts--;
      }
    }
    return puzzle;
  };

  // Function to shuffle an array (used for random number generation)
  const shuffle = (array: number[]): number[] => {
    let currentIndex = array.length,
      randomIndex;
    while (currentIndex != 0) {
      randomIndex = Math.floor(Math.random() * currentIndex);
      currentIndex--;
      [array[currentIndex], array[randomIndex]] = [
        array[randomIndex],
        array[currentIndex],
      ];
    }
    return array;
  };

  // Function to check if a number can be placed in a cell
  const isValid = (
    board: number[][],
    row: number,
    col: number,
    num: number
  ): boolean => {
    // Check row and column
    for (let i = 0; i < 9; i++) {
      if (board[row][i] === num || board[i][col] === num) {
        return false;
      }
    }

    // Check 3x3 subgrid
    const subgridRowStart = Math.floor(row / 3) * 3;
    const subgridColStart = Math.floor(col / 3) * 3;
    for (let i = subgridRowStart; i < subgridRowStart + 3; i++) {
      for (let j = subgridColStart; j < subgridColStart + 3; j++) {
        if (board[i][j] === num) {
          return false;
        }
      }
    }

    return true;
  };

  // Function to handle cell selection
  const handleCellSelect = useCallback((cell: Cell) => {
    setSelectedCell(cell);
  }, []);

  // Function to handle number input
  const handleNumberInput = useCallback(
    (value: number) => {
      if (!selectedCell) {
        toast.error("No cell selected", {
          description: "Please select a cell first before entering a number.",
        });
        playErrorSound();
        return;
      }

      // Check if the cell was part of the initial puzzle
      if (initialBoard[selectedCell.row][selectedCell.col] !== 0) {
        toast.error("Cell locked", {
          description:
            "You cannot modify values that are part of the original puzzle.",
        });
        playErrorSound();
        return; // Prevent changing initial values
      }

      // Update the board with the new value
      const updatedBoard = board.map((row, rowIndex) =>
        row.map((cell, colIndex) =>
          rowIndex === selectedCell.row && colIndex === selectedCell.col
            ? { ...cell, value: value === 0 ? null : value }
            : cell
        )
      );
      setBoard(updatedBoard);

      // Check if the board is solved after each input
      if (isBoardComplete(updatedBoard)) {
        const numberBoard = updatedBoard.map((row) =>
          row.map((cell) => (cell.value === null ? 0 : cell.value))
        );

        if (isValidSudoku(numberBoard)) {
          setIsTimerRunning(false);
          setShowVictoryDialog(true);
          playSuccessSound();
        }
      }
    },
    [selectedCell, initialBoard, board, playErrorSound, playSuccessSound]
  );

  const handleKeyDown = useCallback(
    (e: { key: string; preventDefault: () => void; }) => {
      if (!selectedCell) return;

      const { row, col } = selectedCell;
      let newRow = row;
      let newCol = col;

      // Arrow key navigation
      switch (e.key) {
        case "ArrowUp":
          newRow = Math.max(0, row - 1);
          e.preventDefault();
          break;
        case "ArrowDown":
          newRow = Math.min(8, row + 1);
          e.preventDefault();
          break;
        case "ArrowLeft":
          newCol = Math.max(0, col - 1);
          e.preventDefault();
          break;
        case "ArrowRight":
          newCol = Math.min(8, col + 1);
          e.preventDefault();
          break;
        case "1":
        case "2":
        case "3":
        case "4":
        case "5":
        case "6":
        case "7":
        case "8":
        case "9":
          handleNumberInput(parseInt(e.key));
          e.preventDefault();
          break;
        case "0":
        case "Delete":
        case "Backspace":
          handleNumberInput(0);
          e.preventDefault();
          break;
        default:
          break;
      }

      if (newRow !== row || newCol !== col) {
        const newCell = board[newRow][newCol];
        handleCellSelect(newCell);
      }
    },
    [selectedCell, board, handleNumberInput, handleCellSelect]
  );

  // Add event listener for keyboard
  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleKeyDown]);

  // Function to check if the board is completely filled
  const isBoardComplete = (currentBoard: Cell[][]): boolean => {
    for (let row = 0; row < 9; row++) {
      for (let col = 0; col < 9; col++) {
        if (currentBoard[row][col].value === null) {
          return false; // Found an empty cell
        }
      }
    }
    return true; // All cells are filled
  };

  // Function to validate the entire board
  const validateBoard = () => {
    const numberBoard = board.map((row) =>
      row.map((cell) => (cell.value === null ? 0 : cell.value))
    );

    if (!isBoardComplete(board)) {
      toast.warning("Incomplete Puzzle", {
        description: "The board is not yet complete. Please fill in all cells.",
      });
      playErrorSound();
      return;
    }

    if (isValidSudoku(numberBoard)) {
      setIsTimerRunning(false);
      setShowVictoryDialog(true);
      playSuccessSound();
    } else {
      toast.error("Incorrect Solution", {
        description:
          "The current solution is incorrect. Check for duplicate numbers in rows, columns, or 3x3 grids.",
      });
      playErrorSound();
    }
  };

  // Function to check if the board is a valid Sudoku solution
  const isValidSudoku = (board: number[][]): boolean => {
    // Check rows and columns for duplicates
    for (let i = 0; i < 9; i++) {
      const row = new Set();
      const col = new Set();
      for (let j = 0; j < 9; j++) {
        if (board[i][j] !== 0 && row.has(board[i][j])) return false;
        if (board[i][j] !== 0) row.add(board[i][j]);

        if (board[j][i] !== 0 && col.has(board[j][i])) return false;
        if (board[j][i] !== 0) col.add(board[j][i]);
      }
    }

    // Check 3x3 subgrids for duplicates
    for (let block = 0; block < 9; block++) {
      const subgrid = new Set();
      const subgridRowStart = Math.floor(block / 3) * 3;
      const subgridColStart = (block % 3) * 3;

      for (let i = subgridRowStart; i < subgridRowStart + 3; i++) {
        for (let j = subgridColStart; j < subgridColStart + 3; j++) {
          if (board[i][j] !== 0 && subgrid.has(board[i][j])) return false;
          if (board[i][j] !== 0) subgrid.add(board[i][j]);
        }
      }
    }

    return true;
  };

  // Provide a hint
  const provideHint = () => {
    if (!selectedCell) {
      toast.error("No cell selected", {
        description: "Please select a cell first to get a hint.",
      });
      playErrorSound();
      return;
    }

    if (
      initialBoard[selectedCell.row][selectedCell.col] !== 0 ||
      board[selectedCell.row][selectedCell.col].value !== null
    ) {
      toast.error("Invalid hint request", {
        description:
          "Select an empty cell that isn't part of the original puzzle.",
      });
      playErrorSound();
      return;
    }

    // Create a full board solution to find the correct number
    const fullSolution = Array(9)
      .fill(null)
      .map(() => Array(9).fill(0));

    // Copy current state to the solution
    for (let i = 0; i < 9; i++) {
      for (let j = 0; j < 9; j++) {
        fullSolution[i][j] = board[i][j].value || 0;
      }
    }

    // Try to solve the board
    if (fillSudoku(fullSolution)) {
      const correctValue = fullSolution[selectedCell.row][selectedCell.col];

      // Update the board with the hint
      const updatedBoard = board.map((row, rowIndex) =>
        row.map((cell, colIndex) =>
          rowIndex === selectedCell.row && colIndex === selectedCell.col
            ? { ...cell, value: correctValue }
            : cell
        )
      );

      setBoard(updatedBoard);

      toast.success("Hint provided", {
        description: `The correct number for this cell is ${correctValue}.`,
      });

      // Check if the board is now complete
      if (isBoardComplete(updatedBoard)) {
        const numberBoard = updatedBoard.map((row) =>
          row.map((cell) => (cell.value === null ? 0 : cell.value))
        );

        if (isValidSudoku(numberBoard)) {
          setIsTimerRunning(false);
          setShowVictoryDialog(true);
          playSuccessSound();
        }
      }
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-b from-indigo-900 to-purple-900 text-white font-sans p-4">
      <Toaster richColors position="top-center" />

      <h1 className="text-4xl font-bold mb-2 bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
        Sudoku Challenge
      </h1>

      {/* Add tabIndex to make the container focusable */}
      <div className="max-w-md w-full min-w-[320px] bg-gradient-to-br from-gray-900/90 to-gray-800/90 p-6 rounded-2xl shadow-2xl backdrop-blur-sm border border-gray-700/50 mb-4">
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center gap-2 bg-gray-800/80 py-1 px-3 rounded-full">
            <Clock className="w-4 h-4 text-blue-400" />
            <span className="font-medium">{formatTime(timer)}</span>
          </div>

          <Button
            variant="ghost"
            size="icon"
            className="rounded-full hover:bg-gray-800/80 focus:ring-2 focus:ring-blue-400 focus:outline-none"
            onClick={() => setSoundEnabled(!soundEnabled)}
            aria-label={soundEnabled ? "Mute sound" : "Enable sound"}
          >
            {soundEnabled ? (
              <Volume2 className="w-4 h-4" />
            ) : (
              <VolumeX className="w-4 h-4" />
            )}
          </Button>
        </div>

        <div className="grid grid-cols-3 gap-2 mb-4 bg-gray-800/50 p-2 rounded-xl">
          {Array(3)
            .fill(null)
            .map((_, blockRow) =>
              Array(3)
                .fill(null)
                .map((_, blockCol) => (
                  <div
                    key={`block-${blockRow}-${blockCol}`}
                    className="grid grid-cols-3 gap-1 bg-gray-800/80 rounded-lg p-1"
                  >
                    {Array(3)
                      .fill(null)
                      .map((_, cellRow) =>
                        Array(3)
                          .fill(null)
                          .map((_, cellCol) => {
                            const rowIndex = blockRow * 3 + cellRow;
                            const colIndex = blockCol * 3 + cellCol;
                            const cell = board[rowIndex][colIndex];
                            const isInitialValue =
                              initialBoard[rowIndex][colIndex] !== 0;
                            const isSelected =
                              selectedCell?.row === rowIndex &&
                              selectedCell?.col === colIndex;

                            return (
                              <button
                                key={`${rowIndex}-${colIndex}`}
                                className={cn(
                                  "flex items-center justify-center rounded-lg transition-all duration-200 aspect-square",
                                  "text-lg font-semibold",
                                  "focus:outline-none focus:ring-2 focus:ring-blue-400",
                                  isInitialValue
                                    ? "bg-gray-700/80 text-gray-300 cursor-not-allowed" // Initial values
                                    : isSelected
                                    ? "bg-blue-500/80 text-white shadow-lg scale-105" // Selected cell with animation
                                    : cell.value !== null
                                    ? "bg-gray-700/40 text-blue-300 hover:bg-gray-700/60" // Filled cells
                                    : "bg-gray-800/60 hover:bg-gray-700/40 text-white", // Empty cells
                                  "border border-gray-700/30"
                                )}
                                onClick={() => handleCellSelect(cell)}
                                aria-label={`Cell at row ${
                                  rowIndex + 1
                                }, column ${colIndex + 1}${
                                  cell.value !== null
                                    ? `, value ${cell.value}`
                                    : ", empty"
                                }${isInitialValue ? ", initial value" : ""}`}
                                aria-selected={isSelected ? "true" : "false"}
                                disabled={isInitialValue}
                                tabIndex={0}
                              >
                                {cell.value !== null ? cell.value : ""}
                              </button>
                            );
                          })
                      )}
                  </div>
                ))
            )}
        </div>

        <div className="mb-4">
          <div className="grid grid-cols-5 gap-1 mb-2">
            {[1, 2, 3, 4, 5].map((num) => (
              <Button
                key={num}
                variant="outline"
                className={cn(
                  "h-10 rounded-lg font-semibold transition-all hover:scale-105 hover:bg-blue-600",
                  "bg-gradient-to-br from-blue-500/90 to-blue-600/90 text-white border-0",
                  "shadow-md hover:shadow-blue-500/30",
                  "focus:outline-none focus:ring-2 focus:ring-blue-400"
                )}
                onClick={() => handleNumberInput(num)}
                aria-label={`Enter ${num}`}
              >
                {num}
              </Button>
            ))}
          </div>
          <div className="grid grid-cols-5 gap-1 mb-4">
            {[6, 7, 8, 9].map((num) => (
              <Button
                key={num}
                variant="outline"
                className={cn(
                  "h-10 rounded-lg font-semibold transition-all hover:scale-105 hover:bg-blue-600",
                  "bg-gradient-to-br from-blue-500/90 to-blue-600/90 text-white border-0",
                  "shadow-md hover:shadow-blue-500/30",
                  "focus:outline-none focus:ring-2 focus:ring-blue-400"
                )}
                onClick={() => handleNumberInput(num)}
                aria-label={`Enter ${num}`}
              >
                {num}
              </Button>
            ))}
            <Button
              variant="outline"
              className="h-10 rounded-lg font-semibold transition-all hover:scale-105 hover:bg-red-600 
                        bg-gradient-to-br from-red-500/90 to-red-600/90 text-white border-0
                        shadow-md hover:shadow-red-500/30 focus:outline-none focus:ring-2 focus:ring-red-400"
              onClick={() => handleNumberInput(0)}
              aria-label="Clear cell"
            >
              <Trash2 className="w-5 h-5" />
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 mb-4">
          <Button
            variant="outline"
            className="rounded-lg font-medium bg-gradient-to-br from-green-500/90 to-green-600/90 
                     hover:bg-green-600 text-white border-0 transition-all shadow-md hover:shadow-green-500/30
                     focus:outline-none focus:ring-2 focus:ring-green-400"
            onClick={validateBoard}
            aria-label="Validate solution"
          >
            <CheckCircle className="w-4 h-4 mr-2" />
            Validate
          </Button>
          <Button
            variant="outline"
            className="rounded-lg font-medium bg-gradient-to-br from-purple-500/90 to-purple-600/90 
                     hover:bg-purple-600 text-white border-0 transition-all shadow-md hover:shadow-purple-500/30
                     focus:outline-none focus:ring-2 focus:ring-purple-400"
            onClick={generateNewPuzzle}
            aria-label="Start new game"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            New Game
          </Button>
        </div>

        <div className="flex items-center justify-center gap-3">
          <Button
            variant="outline"
            className="rounded-lg font-medium bg-gradient-to-br from-amber-500/90 to-amber-600/90 
                     hover:bg-amber-600 text-white border-0 transition-all shadow-md hover:shadow-amber-500/30
                     focus:outline-none focus:ring-2 focus:ring-amber-400"
            onClick={provideHint}
            aria-label="Get hint"
          >
            <Lightbulb className="w-4 h-4 mr-2" />
            Hint
          </Button>
        </div>
      </div>

      <div className="max-w-md w-full min-w-[320px] bg-gradient-to-br from-gray-900/90 to-gray-800/90 p-4 rounded-xl shadow-lg backdrop-blur-sm border border-gray-700/50 mb-4">
        <div className="font-medium text-center text-gray-300 mb-2">
          Difficulty Level
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          {["easy", "medium", "hard", "expert"].map((level) => (
            <Button
              key={level}
              variant={difficulty === level ? "default" : "outline"}
              className={cn(
                "rounded-full px-4 transition-all min-w-24",
                "focus:outline-none focus:ring-2 focus:ring-blue-400",
                difficulty === level
                  ? "bg-blue-600 hover:bg-blue-700"
                  : "bg-gray-800/70 hover:bg-gray-700/70 text-gray-300"
              )}
              onClick={() =>
                setDifficulty(level as "easy" | "medium" | "hard" | "expert")
              }
              aria-pressed={difficulty === level}
              aria-label={`${level} difficulty`}
            >
              {level.charAt(0).toUpperCase() + level.slice(1)}
            </Button>
          ))}
        </div>
      </div>

      {/* Victory Dialog - Add keyboard support */}
      <Dialog open={showVictoryDialog} onOpenChange={setShowVictoryDialog}>
        <DialogContent className="bg-gradient-to-br from-gray-900 to-gray-800 border border-gray-700 text-white sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-2xl text-center flex justify-center items-center gap-2">
              <Trophy className="w-6 h-6 text-yellow-400" />
              <span className="bg-gradient-to-r from-yellow-400 to-amber-500 bg-clip-text text-transparent">
                Congratulations!
              </span>
            </DialogTitle>
            <DialogDescription className="text-gray-300 text-center">
              You've successfully solved the {difficulty} puzzle!
            </DialogDescription>
          </DialogHeader>

          <div className="p-6 flex flex-col items-center">
            <div className="text-4xl font-bold mb-4 text-center">
              {formatTime(timer)}
            </div>
            <p className="text-gray-300 mb-6 text-center">
              Your completion time
            </p>
          </div>

          <DialogFooter>
            <Button
              className="w-full rounded-lg bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 focus:outline-none focus:ring-2 focus:ring-blue-400"
              onClick={generateNewPuzzle}
              autoFocus
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Play Again
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SudokuGame;
