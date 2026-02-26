import ConfirmModal from "@/shared/ui/ConfirmModal";
import GradientButton from "@/shared/ui/GradientButton";

type DeleteAvatarConfirmModalProps = {
  isDeleting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export default function DeleteAvatarConfirmModal({ isDeleting, onCancel, onConfirm }: DeleteAvatarConfirmModalProps) {
  return (
    <ConfirmModal
      titleTag="Confirm Delete"
      title="Remove profile photo?"
      description="This will delete your current photo. You can upload a new one anytime."
      isConfirmDisabled={isDeleting}
      onCancel={onCancel}
      confirmButton={
        <GradientButton
          label={isDeleting ? "Deleting..." : "Delete Photo"}
          onClick={onConfirm}
          disabled={isDeleting}
          tone="danger"
        />
      }
    />
  );
}
