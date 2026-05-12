// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./MockERC20.sol";

interface IKiteBondHuntAttackTarget {
    function stakeAndJoin(uint256 huntId) external;
    function selectWinner(uint256 huntId, uint256 submissionIndex) external;
}

contract MockReentrantToken is MockERC20 {
    enum AttackMode {
        None,
        Stake,
        SelectWinner
    }

    IKiteBondHuntAttackTarget public target;
    AttackMode public mode;
    uint256 public huntId;
    uint256 public submissionIndex;
    bool public attempted;

    constructor() MockERC20("Reentrant USDT", "rUSDT", 18) {}

    function setStakeAttack(address target_, uint256 huntId_) external {
        target = IKiteBondHuntAttackTarget(target_);
        huntId = huntId_;
        submissionIndex = 0;
        mode = AttackMode.Stake;
        attempted = false;
    }

    function setSelectWinnerAttack(address target_, uint256 huntId_, uint256 submissionIndex_) external {
        target = IKiteBondHuntAttackTarget(target_);
        huntId = huntId_;
        submissionIndex = submissionIndex_;
        mode = AttackMode.SelectWinner;
        attempted = false;
    }

    function transferFrom(address from, address to, uint256 amount) public override returns (bool) {
        _attemptReentry();
        return super.transferFrom(from, to, amount);
    }

    function transfer(address to, uint256 amount) public override returns (bool) {
        _attemptReentry();
        return super.transfer(to, amount);
    }

    function _attemptReentry() internal {
        if (mode == AttackMode.None || attempted || address(target) == address(0)) return;
        attempted = true;

        if (mode == AttackMode.Stake) {
            try target.stakeAndJoin(huntId) {} catch {}
        } else if (mode == AttackMode.SelectWinner) {
            try target.selectWinner(huntId, submissionIndex) {} catch {}
        }
    }
}
