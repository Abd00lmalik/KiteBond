// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title KiteBondHuntRegistry
 * @notice Manages Agent Hunt lifecycle for npm package security investigations.
 */
contract KiteBondHuntRegistry is ReentrancyGuard, Ownable {
    IERC20 public immutable paymentToken;
    address public treasury;
    address public verifier;

    uint256 public huntCounter;
    uint256 public constant MAX_DEADLINE = 30 days;

    enum HuntStatus {
        Created,
        Open,
        InReview,
        WinnerSelected,
        Settled,
        Cancelled,
        Expired
    }

    enum SubmissionStatus {
        Submitted,
        VerifiedValid,
        VerifiedInvalid,
        Winner,
        StakeReturned,
        Slashed
    }

    struct Hunt {
        uint256 id;
        address creator;
        bytes32 packageNameHash;
        bytes32 versionHash;
        bytes32 termsHash;
        uint8 scanDepth;
        uint256 rewardAmount;
        uint256 stakeRequired;
        uint256 deadline;
        HuntStatus status;
        address winner;
        uint256 createdAt;
        uint256 settledAt;
    }

    struct Submission {
        uint256 huntId;
        address agent;
        bytes32 reportHash;
        SubmissionStatus status;
        uint256 submittedAt;
    }

    mapping(uint256 => Hunt) public hunts;
    mapping(uint256 => Submission[]) public submissions;
    mapping(uint256 => mapping(address => bool)) public hasStaked;
    mapping(uint256 => mapping(address => uint256)) public agentStake;

    event HuntCreated(
        uint256 indexed huntId,
        address indexed creator,
        bytes32 packageNameHash,
        uint256 rewardAmount,
        uint256 stakeRequired,
        uint256 deadline,
        uint256 timestamp
    );
    event RewardLocked(uint256 indexed huntId, uint256 amount, uint256 timestamp);
    event AgentStaked(uint256 indexed huntId, address indexed agent, uint256 stakeAmount, uint256 timestamp);
    event ReportSubmitted(
        uint256 indexed huntId,
        address indexed agent,
        bytes32 reportHash,
        uint256 submissionIndex,
        uint256 timestamp
    );
    event SubmissionVerified(
        uint256 indexed huntId,
        uint256 submissionIndex,
        address agent,
        bool valid,
        bytes32 verificationHash,
        uint256 timestamp
    );
    event WinnerSelected(uint256 indexed huntId, address indexed winner, uint256 submissionIndex, uint256 timestamp);
    event RewardPaid(uint256 indexed huntId, address indexed winner, uint256 amount, uint256 timestamp);
    event StakeReturned(uint256 indexed huntId, address indexed agent, uint256 amount, uint256 timestamp);
    event StakeSlashed(uint256 indexed huntId, address indexed agent, uint256 amount, address treasury, uint256 timestamp);
    event HuntSettled(uint256 indexed huntId, bool hasWinner, uint256 timestamp);
    event HuntCancelled(uint256 indexed huntId, uint256 timestamp);
    event HuntExpired(uint256 indexed huntId, uint256 timestamp);
    event ProofRecorded(uint256 indexed huntId, bytes32 proofHash, uint256 timestamp);

    modifier onlyVerifier() {
        require(msg.sender == verifier || msg.sender == owner(), "Not authorized verifier");
        _;
    }

    constructor(address _paymentToken, address _treasury, address _verifier) Ownable(msg.sender) {
        require(_paymentToken != address(0), "Invalid token");
        require(_treasury != address(0), "Invalid treasury");
        require(_verifier != address(0), "Invalid verifier");
        paymentToken = IERC20(_paymentToken);
        treasury = _treasury;
        verifier = _verifier;
    }

    function createHunt(
        bytes32 packageNameHash,
        bytes32 versionHash,
        bytes32 termsHash,
        uint8 scanDepth,
        uint256 rewardAmount,
        uint256 stakeRequired,
        uint256 deadlineDuration
    ) external nonReentrant returns (uint256 huntId) {
        require(rewardAmount > 0, "Reward must be > 0");
        require(stakeRequired > 0, "Stake must be > 0");
        require(deadlineDuration > 0 && deadlineDuration <= MAX_DEADLINE, "Invalid deadline");

        paymentToken.transferFrom(msg.sender, address(this), rewardAmount);

        huntId = ++huntCounter;
        uint256 deadline = block.timestamp + deadlineDuration;

        hunts[huntId] = Hunt({
            id: huntId,
            creator: msg.sender,
            packageNameHash: packageNameHash,
            versionHash: versionHash,
            termsHash: termsHash,
            scanDepth: scanDepth,
            rewardAmount: rewardAmount,
            stakeRequired: stakeRequired,
            deadline: deadline,
            status: HuntStatus.Open,
            winner: address(0),
            createdAt: block.timestamp,
            settledAt: 0
        });

        emit HuntCreated(huntId, msg.sender, packageNameHash, rewardAmount, stakeRequired, deadline, block.timestamp);
        emit RewardLocked(huntId, rewardAmount, block.timestamp);
    }

    function stakeAndJoin(uint256 huntId) external nonReentrant {
        Hunt storage h = hunts[huntId];
        require(h.status == HuntStatus.Open || h.status == HuntStatus.InReview, "Hunt not accepting agents");
        require(block.timestamp < h.deadline, "Hunt deadline passed");
        require(!hasStaked[huntId][msg.sender], "Already staked");
        require(msg.sender != h.creator || msg.sender == owner(), "Creator cannot be agent");

        paymentToken.transferFrom(msg.sender, address(this), h.stakeRequired);
        hasStaked[huntId][msg.sender] = true;
        agentStake[huntId][msg.sender] = h.stakeRequired;

        emit AgentStaked(huntId, msg.sender, h.stakeRequired, block.timestamp);
    }

    function submitReport(uint256 huntId, bytes32 reportHash) external nonReentrant {
        Hunt storage h = hunts[huntId];
        require(h.status == HuntStatus.Open || h.status == HuntStatus.InReview, "Hunt not accepting submissions");
        require(block.timestamp < h.deadline, "Deadline passed");
        require(hasStaked[huntId][msg.sender], "Must stake first");
        require(reportHash != bytes32(0), "Invalid report hash");

        uint256 submissionIndex = submissions[huntId].length;
        submissions[huntId].push(
            Submission({
                huntId: huntId,
                agent: msg.sender,
                reportHash: reportHash,
                status: SubmissionStatus.Submitted,
                submittedAt: block.timestamp
            })
        );

        if (h.status == HuntStatus.Open) {
            h.status = HuntStatus.InReview;
        }

        emit ReportSubmitted(huntId, msg.sender, reportHash, submissionIndex, block.timestamp);
    }

    function verifySubmission(
        uint256 huntId,
        uint256 submissionIndex,
        bool valid,
        bytes32 verificationHash
    ) external nonReentrant onlyVerifier {
        Hunt storage h = hunts[huntId];
        require(h.status == HuntStatus.InReview, "Hunt not in review");
        require(submissionIndex < submissions[huntId].length, "Invalid index");

        Submission storage s = submissions[huntId][submissionIndex];
        require(s.status == SubmissionStatus.Submitted, "Already verified");

        s.status = valid ? SubmissionStatus.VerifiedValid : SubmissionStatus.VerifiedInvalid;

        if (!valid) {
            uint256 slashAmount = agentStake[huntId][s.agent];
            agentStake[huntId][s.agent] = 0;
            paymentToken.transfer(treasury, slashAmount);
            s.status = SubmissionStatus.Slashed;
            emit StakeSlashed(huntId, s.agent, slashAmount, treasury, block.timestamp);
        }

        emit SubmissionVerified(huntId, submissionIndex, s.agent, valid, verificationHash, block.timestamp);
    }

    function selectWinner(uint256 huntId, uint256 submissionIndex) external nonReentrant {
        Hunt storage h = hunts[huntId];
        require(msg.sender == h.creator || msg.sender == owner(), "Only creator");
        require(h.status == HuntStatus.InReview, "Not in review");
        require(submissionIndex < submissions[huntId].length, "Invalid index");

        Submission storage s = submissions[huntId][submissionIndex];
        require(s.status == SubmissionStatus.VerifiedValid, "Submission not verified valid");

        s.status = SubmissionStatus.Winner;
        h.winner = s.agent;
        h.status = HuntStatus.WinnerSelected;

        emit WinnerSelected(huntId, s.agent, submissionIndex, block.timestamp);

        uint256 winnerStake = agentStake[huntId][s.agent];
        agentStake[huntId][s.agent] = 0;
        paymentToken.transfer(s.agent, h.rewardAmount + winnerStake);

        h.status = HuntStatus.Settled;
        h.settledAt = block.timestamp;

        emit RewardPaid(huntId, s.agent, h.rewardAmount, block.timestamp);
        emit StakeReturned(huntId, s.agent, winnerStake, block.timestamp);
        emit HuntSettled(huntId, true, block.timestamp);

        bytes32 proofHash = keccak256(abi.encodePacked(huntId, s.agent, s.reportHash, block.timestamp));
        emit ProofRecorded(huntId, proofHash, block.timestamp);
    }

    function reclaimStake(uint256 huntId) external nonReentrant {
        Hunt storage h = hunts[huntId];
        require(
            h.status == HuntStatus.Settled || h.status == HuntStatus.Expired || h.status == HuntStatus.Cancelled,
            "Hunt not finalized"
        );

        uint256 stake = agentStake[huntId][msg.sender];
        require(stake > 0, "No stake to reclaim");
        require(msg.sender != h.winner || h.status != HuntStatus.Settled, "Winner already paid");

        bool hasSubmission = false;
        for (uint256 i = 0; i < submissions[huntId].length; i++) {
            if (submissions[huntId][i].agent == msg.sender) {
                hasSubmission = true;
                require(submissions[huntId][i].status == SubmissionStatus.VerifiedValid, "Stake not reclaimable");
                submissions[huntId][i].status = SubmissionStatus.StakeReturned;
                break;
            }
        }

        require(hasSubmission || h.status == HuntStatus.Expired || h.status == HuntStatus.Cancelled, "No valid submission");

        agentStake[huntId][msg.sender] = 0;
        paymentToken.transfer(msg.sender, stake);
        emit StakeReturned(huntId, msg.sender, stake, block.timestamp);
    }

    function expireHunt(uint256 huntId) external nonReentrant {
        Hunt storage h = hunts[huntId];
        require(block.timestamp >= h.deadline, "Not yet expired");
        require(h.status == HuntStatus.Open || h.status == HuntStatus.InReview, "Hunt already finalized");

        bool hasValidSubs = false;
        for (uint256 i = 0; i < submissions[huntId].length; i++) {
            if (submissions[huntId][i].status == SubmissionStatus.VerifiedValid) {
                hasValidSubs = true;
                break;
            }
        }

        if (!hasValidSubs) {
            h.status = HuntStatus.Expired;
            paymentToken.transfer(h.creator, h.rewardAmount);
            emit HuntExpired(huntId, block.timestamp);
        } else {
            h.status = HuntStatus.InReview;
        }
    }

    function cancelHunt(uint256 huntId) external nonReentrant {
        Hunt storage h = hunts[huntId];
        require(msg.sender == h.creator, "Only creator");
        require(h.status == HuntStatus.Open, "Can only cancel Open hunts");
        require(submissions[huntId].length == 0, "Cannot cancel with submissions");

        h.status = HuntStatus.Cancelled;
        paymentToken.transfer(h.creator, h.rewardAmount);
        emit HuntCancelled(huntId, block.timestamp);
    }

    function getHunt(uint256 huntId) external view returns (Hunt memory) {
        return hunts[huntId];
    }

    function getSubmissions(uint256 huntId) external view returns (Submission[] memory) {
        return submissions[huntId];
    }

    function getSubmissionCount(uint256 huntId) external view returns (uint256) {
        return submissions[huntId].length;
    }

    function setVerifier(address _verifier) external onlyOwner {
        require(_verifier != address(0), "Invalid verifier");
        verifier = _verifier;
    }

    function setTreasury(address _treasury) external onlyOwner {
        require(_treasury != address(0), "Invalid treasury");
        treasury = _treasury;
    }
}
