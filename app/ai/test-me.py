"""
ASSIGNMENT 2
1D Transient Diffusion with Heat Generation using FDM

Run:
    py assignment2_heat_fdm.py

Dependencies:
    py -m pip install numpy scipy matplotlib

The program runs Parts 1-9 in sequence. At each part you can:
    y   -> run the part now
    n   -> skip to the next part
    end -> stop the program immediately

Boundary-condition support:
    Dirichlet: fixed temperature
    Neumann: insulated or prescribed heat flux
    Robin: convection

Numerical notes:
- N always means number of spatial intervals; the solver uses N+1 nodes.
- The explicit stability limit Fo <= 0.5 applies to the standard interior
  diffusion equation. Boundary closures and source terms should also be checked.
- Heat flux uses a ghost-node closure. The "first-order" option uses a
  first-order boundary-gradient approximation; the "second-order" option uses
  a centered ghost-node gradient / second-order one-sided reconstruction.
- The implicit and Crank-Nicolson systems are tridiagonal and solved by TDMA.
"""

from __future__ import annotations

import math
import sys
from dataclasses import dataclass
from typing import Callable, Optional

import numpy as np
import matplotlib.pyplot as plt


# ---------------------------- Physical model ---------------------------- #

@dataclass
class Boundary:
    kind: str                 # "dirichlet", "insulated", "flux", "convection"
    value: float = 0.0        # temperature for Dirichlet; flux q'' for flux
    h: float = 0.0            # convection coefficient
    T_inf: float = 300.0      # ambient temperature
    order: int = 2            # flux boundary approximation order


@dataclass
class Material:
    L: float = 0.1
    k: float = 10.0
    rho: float = 7800.0
    cp: float = 500.0
    qgen: float = 5.0e5

    @property
    def alpha(self) -> float:
        return self.k / (self.rho * self.cp)


def ask_float(prompt: str, default: float, minimum: Optional[float] = None) -> float:
    while True:
        raw = input(f"{prompt} [{default}]: ").strip()
        try:
            value = default if raw == "" else float(raw)
            if not math.isfinite(value):
                raise ValueError
            if minimum is not None and value < minimum:
                print(f"Enter a value >= {minimum}.")
                continue
            return value
        except ValueError:
            print("Please enter a valid number.")


def ask_int(prompt: str, default: int, minimum: int = 1) -> int:
    while True:
        raw = input(f"{prompt} [{default}]: ").strip()
        try:
            value = default if raw == "" else int(raw)
            if value < minimum:
                print(f"Enter an integer >= {minimum}.")
                continue
            return value
        except ValueError:
            print("Please enter a valid integer.")


def ask_part_action(part_title: str) -> str:
    """
    Ask what to do with the next assignment part.

    Returns
    -------
    'run'  -> execute this part now
    'skip' -> move on to the next part
    'end'  -> stop the program immediately
    """
    while True:
        raw = input(
            f"Next: {part_title}\n"
            "  Run this part? (y = run / n = next / end = stop program) [y]: "
        ).strip().lower()
        if raw == "" or raw in ("y", "yes"):
            return "run"
        if raw in ("n", "no", "next"):
            return "skip"
        if raw in ("end", "e", "exit", "q", "quit", "stop"):
            return "end"
        print("  Please enter y (run), n (next), or end (stop the program).")


def ask_method(default: str = "explicit") -> str:
    choices = {"e": "explicit", "explicit": "explicit",
               "i": "implicit", "implicit": "implicit",
               "c": "cn", "cn": "cn", "crank-nicolson": "cn"}
    while True:
        raw = input(f"Method: explicit / implicit / CN [{default}]: ").strip().lower()
        if not raw:
            return default
        if raw in choices:
            return choices[raw]
        print("Choose explicit, implicit, or CN.")


def initial_profile(x: np.ndarray, mode: str = "uniform", value: float = 300.0) -> np.ndarray:
    if mode == "sin":
        return value + 20.0 * np.sin(np.pi * x / x[-1])
    return np.full_like(x, value, dtype=float)


# ---------------------- Boundary operator and solver -------------------- #

def build_operator(
    material: Material,
    N_intervals: int,
    left: Boundary,
    right: Boundary,
) -> tuple[np.ndarray, np.ndarray, list[tuple[int, float]]]:
    """
    Construct T_t = A T + b for non-Dirichlet degrees of freedom.
    Dirichlet rows are zeroed and overwritten with the prescribed temperature.
    The resulting matrix is tridiagonal.
    """
    N = N_intervals + 1
    dx = material.L / N_intervals
    alpha = material.alpha
    A = np.zeros((N, N), dtype=float)
    b = np.full(N, material.qgen / (material.rho * material.cp), dtype=float)
    fixed: list[tuple[int, float]] = []

    # Interior nodes
    for i in range(1, N - 1):
        A[i, i - 1] = alpha / dx**2
        A[i, i] = -2.0 * alpha / dx**2
        A[i, i + 1] = alpha / dx**2

    def apply_boundary(index: int, side: str, bc: Boundary) -> None:
        nonlocal A, b, fixed
        other = 1 if side == "left" else N - 2
        inward = 1 if side == "left" else N - 2

        if bc.kind == "dirichlet":
            fixed.append((index, bc.value))
            A[index, :] = 0.0
            b[index] = 0.0
            return

        if bc.kind == "insulated":
            A[index, index] = -2.0 * alpha / dx**2
            A[index, inward] = 2.0 * alpha / dx**2
            return

        if bc.kind == "flux":
            # Sign convention: -k*dT/dx = q'' at the left boundary.
            # At the right boundary the same outward-normal convention is used:
            # -k*dT/dx = q'' is accepted as the user-provided derivative equation.
            # The assignment's prescribed flux is at x=0.
            if side != "left":
                raise ValueError("Heat-flux boundary is currently defined at x=0 (left).")
            if bc.order == 1:
                # First-order forward derivative: (T1 - T0)/dx = -q''/k.
                # Enforce the boundary algebraically after each time step. The
                # PDE operator row is zero; boundary value is reconstructed.
                A[index, :] = 0.0
                b[index] = 0.0
            else:
                # Ghost node: -k*(T1 - T_-1)/(2 dx) = q''
                # T_-1 = T1 + 2 dx q''/k
                # Txx(0) = (2*T1 - 2*T0)/dx^2 + 2*q''/(k*dx)
                A[index, index] = -2.0 * alpha / dx**2
                A[index, inward] = 2.0 * alpha / dx**2
                b[index] += 2.0 * bc.value / (material.rho * material.cp * dx)
            return

        if bc.kind == "convection":
            # Assignment convention at x=L:
            # -k*dT/dx = h*(T_surface - T_inf)
            if side != "right":
                raise ValueError("Convective boundary is currently defined at x=L (right).")
            # Ghost node T_{N} = T_{N-2} - 2 dx h/k * (T_{N-1}-T_inf)
            A[index, index] = -2.0 * alpha / dx**2 - 2.0 * h_term(bc, material) / dx
            A[index, inward] = 2.0 * alpha / dx**2
            b[index] += 2.0 * alpha * bc.h * bc.T_inf / (material.k * dx)
            return

        raise ValueError(f"Unknown boundary kind: {bc.kind}")

    apply_boundary(0, "left", left)
    apply_boundary(N - 1, "right", right)

    # Dirichlet nodes are prescribed, so remove their heat-generation source.
    for idx, _ in fixed:
        b[idx] = 0.0

    return A, b, fixed


def h_term(bc: Boundary, material: Material) -> float:
    # alpha*h/k; used so the boundary row has units 1/s.
    return material.alpha * bc.h / material.k


def tdma(lower: np.ndarray, diag: np.ndarray, upper: np.ndarray, rhs: np.ndarray) -> np.ndarray:
    """Thomas algorithm for a tridiagonal linear system."""
    n = len(diag)
    c = np.array(upper, dtype=float, copy=True)
    d = np.array(rhs, dtype=float, copy=True)
    b = np.array(diag, dtype=float, copy=True)
    a = np.array(lower, dtype=float, copy=True)

    for i in range(1, n):
        if abs(b[i - 1]) < 1e-30:
            raise np.linalg.LinAlgError("TDMA encountered a zero pivot.")
        m = a[i] / b[i - 1]
        b[i] -= m * c[i - 1]
        d[i] -= m * d[i - 1]

    if abs(b[-1]) < 1e-30:
        raise np.linalg.LinAlgError("TDMA encountered a zero final pivot.")
    x = np.empty(n, dtype=float)
    x[-1] = d[-1] / b[-1]
    for i in range(n - 2, -1, -1):
        x[i] = (d[i] - c[i] * x[i + 1]) / b[i]
    return x


def tridiagonal_solve(matrix: np.ndarray, rhs: np.ndarray) -> np.ndarray:
    """Extract the three diagonals and solve with TDMA."""
    lower = np.zeros(len(rhs))
    upper = np.zeros(len(rhs))
    diag = np.diag(matrix).copy()
    lower[1:] = np.diag(matrix, k=-1)
    upper[:-1] = np.diag(matrix, k=1)
    # Guard against accidentally non-tridiagonal matrices.
    check = matrix.copy()
    for i in range(len(rhs)):
        check[i, i] = 0.0
        if i > 0:
            check[i, i - 1] = 0.0
        if i < len(rhs) - 1:
            check[i, i + 1] = 0.0
    if np.max(np.abs(check)) > 1e-12:
        raise ValueError("Matrix is not tridiagonal; TDMA cannot be used.")
    return tdma(lower, diag, upper, rhs)


def simulate(
    material: Material,
    N_intervals: int,
    t_end: float,
    dt: float,
    left: Boundary,
    right: Boundary,
    method: str = "explicit",
    T_initial: float = 300.0,
    save_times: Optional[list[float]] = None,
) -> tuple[np.ndarray, np.ndarray, np.ndarray, dict[float, np.ndarray]]:
    """Run one transient simulation. Returns x, times, history, saved profiles."""
    if N_intervals < 2:
        raise ValueError("Use at least 2 spatial intervals.")
    if t_end <= 0 or dt <= 0:
        raise ValueError("t_end and dt must be positive.")

    N = N_intervals + 1
    x = np.linspace(0.0, material.L, N)
    dx = material.L / N_intervals
    nsteps = int(math.ceil(t_end / dt))
    dt = t_end / nsteps
    times = np.linspace(0.0, t_end, nsteps + 1)
    Fo = material.alpha * dt / dx**2

    method = method.lower()
    if method not in ("explicit", "implicit", "cn"):
        raise ValueError("Method must be explicit, implicit, or CN.")
    if method == "explicit" and Fo > 0.5 + 1e-12:
        raise ValueError(
            f"Explicit scheme rejected: Fo={Fo:.5g} > 0.5. "
            "Reduce dt or increase the grid spacing."
        )

    A, b, fixed = build_operator(material, N_intervals, left, right)
    I = np.eye(N)
    T = initial_profile(x, "uniform", T_initial)

    # First-order flux boundary is an algebraic boundary relation.
    def apply_constraints(arr: np.ndarray) -> None:
        for idx, value in fixed:
            arr[idx] = value
        if left.kind == "flux" and left.order == 1:
            arr[0] = arr[1] + dx * left.value / material.k

    apply_constraints(T)
    history = np.empty((nsteps + 1, N), dtype=float)
    history[0] = T.copy()
    requested = save_times or []
    saved: dict[float, np.ndarray] = {}

    if method == "implicit":
        M = I - dt * A
    elif method == "cn":
        M = I - 0.5 * dt * A

    # At first-order flux boundary, replace the row by T0 - T1 = dx*q''/k
    # for implicit/CN solves, and reconstruct explicitly after updating interior.
    M_first = None
    if left.kind == "flux" and left.order == 1 and method in ("implicit", "cn"):
        M_first = M.copy()
        M_first[0, :] = 0.0
        M_first[0, 0] = 1.0
        M_first[0, 1] = -1.0

    for n in range(nsteps):
        if method == "explicit":
            Tnew = T + dt * (A @ T + b)
        elif method == "implicit":
            rhs = T + dt * b
            for idx, value in fixed:
                rhs[idx] = value
            if M_first is not None:
                rhs[0] = dx * left.value / material.k
                Tnew = tridiagonal_solve(M_first, rhs)
            else:
                Tnew = tridiagonal_solve(M, rhs)
        else:
            rhs = (I + 0.5 * dt * A) @ T + dt * b
            for idx, value in fixed:
                rhs[idx] = value
            if M_first is not None:
                M_cn = M.copy()
                M_cn[0, :] = 0.0
                M_cn[0, 0] = 1.0
                M_cn[0, 1] = -1.0
                rhs[0] = dx * left.value / material.k
                Tnew = tridiagonal_solve(M_cn, rhs)
            else:
                Tnew = tridiagonal_solve(M, rhs)

        apply_constraints(Tnew)
        if not np.all(np.isfinite(Tnew)):
            raise FloatingPointError("Non-finite temperature detected; numerical solution diverged.")
        T = Tnew
        history[n + 1] = T.copy()

    for target in requested:
        idx = int(np.argmin(np.abs(times - target)))
        saved[float(times[idx])] = history[idx].copy()

    return x, times, history, saved


# -------------------------- Analytical solutions ------------------------ #

def steady_state_dirichlet(material: Material, x: np.ndarray, TL: float, TR: float) -> np.ndarray:
    """Analytical steady state for fixed temperatures at both ends."""
    L, k, q = material.L, material.k, material.qgen
    return TL + (TR - TL) * x / L + q * x * (L - x) / (2.0 * k)


def rmse(a: np.ndarray, b: np.ndarray) -> float:
    return float(np.sqrt(np.mean((a - b) ** 2)))


def max_abs_error(a: np.ndarray, b: np.ndarray) -> float:
    return float(np.max(np.abs(a - b)))


# ------------------------------- Plotting ------------------------------- #

def plot_profiles(x: np.ndarray, times: np.ndarray, history: np.ndarray,
                  title: str, selected_times: Optional[list[float]] = None,
                  analytical: Optional[np.ndarray] = None) -> None:
    plt.figure()
    if selected_times:
        for target in selected_times:
            idx = int(np.argmin(np.abs(times - target)))
            plt.plot(x, history[idx], marker="o", markersize=3, label=f"t={times[idx]:.3g} s")
    else:
        indices = np.linspace(0, len(times) - 1, min(6, len(times)), dtype=int)
        for idx in indices:
            plt.plot(x, history[idx], label=f"t={times[idx]:.3g} s")
    if analytical is not None:
        plt.plot(x, analytical, "--", linewidth=2, label="Analytical steady state")
    plt.xlabel("x (m)")
    plt.ylabel("Temperature (°C)")
    plt.title(title)
    plt.grid(True)
    plt.legend()
    plt.tight_layout()
    plt.show()


def plot_midpoint(times: np.ndarray, history: np.ndarray, title: str) -> None:
    mid = history.shape[1] // 2
    plt.figure()
    plt.plot(times, history[:, mid])
    plt.xlabel("Time (s)")
    plt.ylabel("Midpoint temperature (°C)")
    plt.title(title)
    plt.grid(True)
    plt.tight_layout()
    plt.show()


def print_temperature_table(x: np.ndarray, times: np.ndarray, history: np.ndarray,
                            requested: list[float]) -> None:
    print("\nTemperature table (nearest available time):")
    print(f"{'Requested (s)':>15} {'Actual (s)':>12} {'T at midpoint (°C)':>22}")
    for target in requested:
        idx = int(np.argmin(np.abs(times - target)))
        print(f"{target:15.4f} {times[idx]:12.4f} {history[idx, len(x)//2]:22.6f}")


def print_grid_table(rows: list[tuple[int, float, float, float]]) -> None:
    print("\nGrid independence:")
    print(f"{'Intervals':>10} {'dx (m)':>12} {'Tmax (°C)':>14} {'Change (%)':>14}")
    for n, dx, tmax, change in rows:
        print(f"{n:10d} {dx:12.6g} {tmax:14.6f} {change:14.6f}")


# ---------------------------- Assignment parts --------------------------- #

def run_part1() -> None:
    print("\n" + "=" * 72 + "\nPART 1 — Explicit scheme, fixed-temperature boundaries\n" + "=" * 72)
    m = Material()
    Nint = 10
    Fo = 0.4
    dx = m.L / Nint
    dt_stable = Fo * dx**2 / m.alpha
    print(f"alpha = {m.alpha:.6e} m^2/s")
    print(f"Intervals = {Nint}; nodes = {Nint+1}; dx = {dx:.6f} m")
    print(f"dt for Fo={Fo} is {dt_stable:.6f} s")
    print("For exact reporting at 10, 20 and 50 s, the program uses a smaller dt.")
    dt = min(dt_stable, 0.5)  # small enough to sample target times accurately
    dt = 0.5
    left, right = Boundary("dirichlet", 400.0), Boundary("dirichlet", 300.0)
    x, t, T, _ = simulate(m, Nint, 50.0, dt, left, right, "explicit", 300.0,
                          [10, 20, 50])
    print_temperature_table(x, t, T, [10, 20, 50])
    exact = steady_state_dirichlet(m, x, 400.0, 300.0)
    print(f"Steady-state analytical Tmax = {np.max(exact):.6f} °C")
    print(f"At t=50 s, RMSE vs steady state = {rmse(T[-1], exact):.6f} °C")
    plot_profiles(x, t, T, "Part 1: explicit FDM with fixed temperatures",
                  [10, 20, 50], analytical=exact)
    plot_midpoint(t, T, "Part 1: midpoint temperature history")


def run_part2() -> None:
    print("\n" + "=" * 72 + "\nPART 2 — Insulated left boundary, fixed right temperature\n" + "=" * 72)
    m = Material()
    nint = ask_int("Number of spatial intervals", 20, 2)
    tend = ask_float("End time (s)", 50.0, 0.01)
    Fo = ask_float("Explicit Fourier number (<= 0.5)", 0.4, 0.001)
    dx = m.L / nint
    dt = Fo * dx**2 / m.alpha
    left, right = Boundary("insulated"), Boundary("dirichlet", 300.0)
    x, t, T, _ = simulate(m, nint, tend, dt, left, right, "explicit", 300.0)
    print(f"alpha={m.alpha:.6e} m^2/s, dx={dx:.6g} m, dt={t[1]-t[0]:.6g} s")
    print(f"Maximum final temperature = {np.max(T[-1]):.6f} °C")
    plot_profiles(x, t, T, "Part 2: insulated left boundary")


def run_part3() -> None:
    print("\n" + "=" * 72 + "\nPART 3 — Constant heat-flux boundary\n" + "=" * 72)
    m = Material(qgen=5.0e5)
    qflux = 20000.0
    nint = ask_int("Number of spatial intervals", 20, 2)
    tend = ask_float("End time (s)", 50.0, 0.01)
    Fo = ask_float("Explicit Fourier number (<= 0.5)", 0.4, 0.001)
    dx = m.L / nint
    dt = Fo * dx**2 / m.alpha
    results = []
    for order in (1, 2):
        left = Boundary("flux", value=qflux, order=order)
        right = Boundary("dirichlet", 300.0)
        x, t, T, _ = simulate(m, nint, tend, dt, left, right, "explicit", 300.0)
        results.append((order, T))
        print(f"Order {order}: heated boundary T(0,t_end) = {T[-1, 0]:.6f} °C")
    print(f"Difference in boundary temperature = {abs(results[0][1][-1,0]-results[1][1][-1,0]):.6f} °C")
    plt.figure()
    plt.plot(x, results[0][1][-1], marker="o", label="First-order flux")
    plt.plot(x, results[1][1][-1], marker="s", label="Second-order ghost-node flux")
    plt.xlabel("x (m)")
    plt.ylabel("Temperature (°C)")
    plt.title("Part 3: first- vs second-order heat-flux closure")
    plt.grid(True)
    plt.legend()
    plt.tight_layout()
    plt.show()


def run_part4() -> None:
    print("\n" + "=" * 72 + "\nPART 4 — Convective right boundary\n" + "=" * 72)
    m = Material()
    nint = ask_int("Number of spatial intervals", 20, 2)
    tend = ask_float("End time (s)", 100.0, 0.01)
    Fo = ask_float("Explicit Fourier number (<= 0.5)", 0.4, 0.001)
    h = ask_float("Convection coefficient h (W/m^2 K)", 100.0, 0.0)
    tinf = ask_float("Ambient temperature (°C)", 300.0)
    Tleft = ask_float("Fixed left temperature (°C)", 500.0)
    dx = m.L / nint
    dt = Fo * dx**2 / m.alpha
    left = Boundary("dirichlet", Tleft)
    right = Boundary("convection", h=h, T_inf=tinf)
    x, t, T, _ = simulate(m, nint, tend, dt, left, right, "explicit", 300.0)
    print(f"Maximum final temperature = {np.max(T[-1]):.6f} °C")
    # Analytical steady state: T = T_left + C1*x - qdot*x^2/(2k).
    # Apply -k*T'(L) = h*(T(L)-T_inf) to determine C1.
    C1 = (m.qgen * m.L - h * (Tleft - m.qgen * m.L**2 / (2*m.k) - tinf)) / (m.k + h*m.L)
    analytical = Tleft + C1*x - m.qgen*x**2/(2*m.k)
    print(f"Analytical steady-state surface temperature T(L) = {analytical[-1]:.6f} °C")
    print(f"Final-time RMSE vs analytical steady state = {rmse(T[-1], analytical):.6f} °C")
    plot_profiles(x, t, T, "Part 4: convection at x=L", analytical=analytical)


def run_part5() -> None:
    print("\n" + "=" * 72 + "\nPART 5 — Fully implicit FDM and TDMA\n" + "=" * 72)
    m = Material()
    nint = ask_int("Number of spatial intervals", 20, 2)
    tend = ask_float("End time (s)", 50.0, 0.01)
    left, right = Boundary("dirichlet", 400.0), Boundary("dirichlet", 300.0)
    dx = m.L / nint
    rows = []
    plt.figure()
    for Fo in (0.5, 1.0, 2.0, 5.0):
        dt = Fo * dx**2 / m.alpha
        x, t, T, _ = simulate(m, nint, tend, dt, left, right, "implicit", 300.0)
        rows.append((Fo, t[1] - t[0], float(np.max(T[-1])), float(T[-1, nint//2])))
        plt.plot(x, T[-1], label=f"Fo={Fo:g}")
    print(f"{'Target Fo':>10} {'Actual dt':>12} {'Tmax':>14} {'Tmid(final)':>16}")
    for row in rows:
        print(f"{row[0]:10.3g} {row[1]:12.6g} {row[2]:14.6f} {row[3]:16.6f}")
    plt.xlabel("x (m)")
    plt.ylabel("Temperature (°C)")
    plt.title("Part 5: implicit solutions for different Fourier numbers")
    plt.grid(True)
    plt.legend()
    plt.tight_layout()
    plt.show()
    print("Implicit diffusion is unconditionally linearly stable for this standard")
    print("formulation, but very large time steps reduce temporal accuracy.")


def run_part6() -> None:
    print("\n" + "=" * 72 + "\nPART 6 — Crank-Nicolson vs explicit and implicit\n" + "=" * 72)
    m = Material()
    nint = ask_int("Number of spatial intervals", 20, 2)
    tend = ask_float("End time (s)", 50.0, 0.01)
    Fo = ask_float("Fourier number for comparison", 0.4, 0.001)
    dt = Fo * (m.L / nint)**2 / m.alpha
    left, right = Boundary("dirichlet", 400.0), Boundary("dirichlet", 300.0)
    plt.figure()
    results = {}
    for method in ("explicit", "implicit", "cn"):
        # Explicit needs Fo <= 0.5; user-supplied Fo is checked by simulate().
        x, t, T, _ = simulate(m, nint, tend, dt, left, right, method, 300.0)
        results[method] = T[-1]
        plt.plot(x, T[-1], label=method.upper())
    plt.xlabel("x (m)")
    plt.ylabel("Temperature (°C)")
    plt.title("Part 6: method comparison at final time")
    plt.grid(True)
    plt.legend()
    plt.tight_layout()
    plt.show()
    print("Maximum absolute differences at final time:")
    print(f"Explicit vs implicit: {max_abs_error(results['explicit'], results['implicit']):.6f} °C")
    print(f"Explicit vs CN:       {max_abs_error(results['explicit'], results['cn']):.6f} °C")
    print(f"Implicit vs CN:       {max_abs_error(results['implicit'], results['cn']):.6f} °C")


def run_part7() -> None:
    print("\n" + "=" * 72 + "\nPART 7 — Comparison of boundary-condition cases\n" + "=" * 72)
    m = Material()
    nint = ask_int("Number of spatial intervals", 20, 2)
    tend = ask_float("End time (s)", 50.0, 0.01)
    Fo = ask_float("Fourier number for explicit runs (<= 0.5)", 0.4, 0.001)
    dt = Fo * (m.L / nint)**2 / m.alpha
    cases = {
        "A: fixed/fixed": (Boundary("dirichlet", 400.0), Boundary("dirichlet", 300.0)),
        "B: insulated/fixed": (Boundary("insulated"), Boundary("dirichlet", 300.0)),
        "C: flux/fixed": (Boundary("flux", value=20000.0, order=2), Boundary("dirichlet", 300.0)),
        "D: fixed/convection": (Boundary("dirichlet", 500.0), Boundary("convection", h=100.0, T_inf=300.0)),
    }
    for label, (left, right) in cases.items():
        print(f"\n{label}")
        for method in ("explicit", "implicit"):
            x, t, T, _ = simulate(m, nint, tend, dt, left, right, method, 300.0)
            print(f"  {method:8s} | Tmax(final) = {np.max(T[-1]):.6f} °C | Tmid(final) = {T[-1, nint//2]:.6f} °C")
            plot_profiles(x, t, T, f"Part 7: {label} — {method}")


def run_part8() -> None:
    print("\n" + "=" * 72 + "\nPART 8 — Grid independence study\n" + "=" * 72)
    m = Material()
    tend = ask_float("End time (s)", 50.0, 0.01)
    left, right = Boundary("dirichlet", 400.0), Boundary("dirichlet", 300.0)
    rows = []
    previous = None
    for nint in (5, 10, 20, 40, 80):
        dx = m.L / nint
        Fo = 0.4
        dt = Fo * dx**2 / m.alpha
        _, _, T, _ = simulate(m, nint, tend, dt, left, right, "explicit", 300.0)
        tmax = float(np.max(T[-1]))
        change = float("nan") if previous is None else abs(tmax - previous) / max(abs(tmax), 1e-14) * 100
        rows.append((nint, dx, tmax, change))
        previous = tmax
    print_grid_table(rows)
    print("A grid is commonly considered adequate when successive refinement changes")
    print("the chosen output (for example Tmax) by less than a stated tolerance,")
    print("often 1% or 0.5%, depending on the assignment requirements.")


def run_part9() -> None:
    print("\n" + "=" * 72 + "\nPART 9 — Time-step independence and explicit stability\n" + "=" * 72)
    m = Material()
    nint = ask_int("Number of spatial intervals", 20, 2)
    tend = ask_float("End time (s)", 50.0, 0.01)
    dx = m.L / nint
    left, right = Boundary("dirichlet", 400.0), Boundary("dirichlet", 300.0)
    Fo_values = (0.1, 0.25, 0.4, 0.5, 0.6)
    plt.figure()
    print(f"{'Fo target':>10} {'dt (s)':>12} {'stable?':>10} {'Tmid(final)':>16}")
    for Fo in Fo_values:
        dt = Fo * dx**2 / m.alpha
        if Fo > 0.5:
            print(f"{Fo:10.3g} {dt:12.6g} {'NO':>10} {'not run':>16}")
            continue
        x, t, T, _ = simulate(m, nint, tend, dt, left, right, "explicit", 300.0)
        print(f"{Fo:10.3g} {t[1]-t[0]:12.6g} {'YES':>10} {T[-1,nint//2]:16.6f}")
        plt.plot(t, T[:, nint//2], label=f"Fo={Fo:g}")
    plt.xlabel("Time (s)")
    plt.ylabel("Midpoint temperature (°C)")
    plt.title("Part 9: midpoint temperature for different explicit Fourier numbers")
    plt.grid(True)
    plt.legend()
    plt.tight_layout()
    plt.show()
    print("For the standard 1D explicit diffusion scheme, Fo > 0.5 violates the")
    print("usual stability limit. The program deliberately skips Fo=0.6 instead of")
    print("producing an untrustworthy result.")


# --------------------------- Main user interface ------------------------ #

PARTS: list[tuple[str, Callable[[], None]]] = [
    ("Part 1: Explicit, fixed-temperature boundaries", run_part1),
    ("Part 2: Insulated boundary", run_part2),
    ("Part 3: Constant heat-flux boundary", run_part3),
    ("Part 4: Convective boundary", run_part4),
    ("Part 5: Fully implicit method and TDMA", run_part5),
    ("Part 6: Crank-Nicolson comparison", run_part6),
    ("Part 7: Boundary-condition comparison", run_part7),
    ("Part 8: Grid independence", run_part8),
    ("Part 9: Time-step independence", run_part9),
]


def main() -> None:
    print("=" * 72)
    print("ASSIGNMENT 2 — 1D TRANSIENT HEAT DIFFUSION WITH HEAT GENERATION")
    print("=" * 72)
    print("Default material: L=0.1 m, k=10 W/mK, rho=7800 kg/m^3, cp=500 J/kgK")
    print("Default generation: qdot=5e5 W/m^3")
    print("Parts run in assignment order.")
    print("At each prompt: y = run, n = next (skip), end = stop the program.")

    for title, function in PARTS:
        action = ask_part_action(title)
        if action == "end":
            print("\nProgram stopped by user before this part.")
            return
        if action == "skip":
            print("Skipped.")
            continue

        try:
            function()
        except (ValueError, FloatingPointError, np.linalg.LinAlgError) as exc:
            print(f"\nPart stopped due to an error: {exc}")
            print("Correct the input or numerical setting and rerun the program.")
        except KeyboardInterrupt:
            print("\nPart interrupted by user.")

    print("\nAll assignment parts have been offered. Close any plot windows to finish.")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nProgram stopped.")