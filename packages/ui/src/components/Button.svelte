<script lang="ts">
  import type { HTMLButtonAttributes } from "svelte/elements";

  interface $$Props extends HTMLButtonAttributes {
    variant: "primary" | "secondary" | "danger";
  }
  export let variant: "primary" | "secondary" | "danger";
</script>

<button {...$$restProps} on:click class={variant}>
  <span class="front"> <slot /> </span>
</button>

<style>
  button {
    position: relative;
    border: none;
    background: transparent;
    padding: 0;
    cursor: pointer;
    outline-offset: 4px;
    transition: filter 250ms;
    z-index: 1;
  }
  button::before {
    position: absolute;
    content: "";
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    border-radius: 12px;
    background: hsl(0deg 0% 0% / 0.25);
    will-change: transform;
    transform: translateY(2px);
    transition: transform 600ms cubic-bezier(0.3, 0.7, 0.4, 1);
  }
  button::after {
    position: absolute;
    z-index: -1;
    content: "";
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    border-radius: 12px;
    background: linear-gradient(to left, var(--edge) 0%, var(--shade) 8%, var(--shade) 92%, var(--edge) 100%);
  }
  .front {
    display: block;
    position: relative;
    padding: 12px 42px;
    border-radius: 12px;
    font-size: 1.25rem;
    color: white;
    background: var(--face);
    will-change: transform;
    transform: translateY(-4px);
    transition: transform 600ms cubic-bezier(0.3, 0.7, 0.4, 1);
  }
  button:hover {
    filter: brightness(110%);
  }
  button:hover .front {
    transform: translateY(-6px);
    transition: transform 250ms cubic-bezier(0.3, 0.7, 0.4, 1.5);
  }
  button:active .front {
    transform: translateY(-2px);
    transition: transform 34ms;
  }
  button:hover ::before {
    transform: translateY(4px);
    transition: transform 250ms cubic-bezier(0.3, 0.7, 0.4, 1.5);
  }
  button:active ::before {
    transform: translateY(1px);
    transition: transform 34ms;
  }
  button:focus:not(:focus-visible) {
    outline: none;
  }
  button.primary {
    --edge: #12334d;
    --shade: #247ba0;
    --face: #2e9cca;
  }
  button.secondary {
    --edge: #252a34;
    --shade: #3b4454;
    --face: #697386;
  }
  button.danger {
    --edge: #52001b;
    --shade: #a30036;
    --face: #f0003c;
  }
</style>
